import {Skia, type SkImage} from '@shopify/react-native-skia';
import type {ImagePickerResult} from '../hooks/useImagePicker';
import type {InterpretImagePayload, InterpretImageStats} from './types';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const JPEG_FORMAT = 3;
const CLOUD_MAX_BYTES = 1_800_000;
const PREVIEW_QUALITY_LADDER = [84, 78, 72] as const;
const PHASE_FAST_MAX_EDGE = 1280;
const PHASE_REFINE_MAX_EDGE = 1664;

export type CloudPreviewPhase = 'fast' | 'refine';

export interface CloudPreviewPayload extends InterpretImagePayload {
  payloadBytes: number;
  encodeQuality: number;
  maxEdgeApplied: number;
}

interface CloudPreviewPolicy {
  maxEdge: number;
  qualityLadder: readonly number[];
}

const buildNeutralStats = (): InterpretImageStats => ({
  lumaMean: 0.5,
  lumaStd: 0.2,
  highlightClipPct: 0.02,
  shadowClipPct: 0.02,
  saturationMean: 0.35,
});

export const estimateBase64Bytes = (base64: string): number => {
  if (!base64) {
    return 0;
  }
  const padded = (base64.match(/=*$/)?.[0].length || 0);
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padded);
};

const resolvePhaseMaxEdge = (
  width: number,
  height: number,
  phase: CloudPreviewPhase,
): number => {
  const longEdge = Math.max(width, height);
  if (phase === 'fast') {
    return Math.min(longEdge, PHASE_FAST_MAX_EDGE);
  }
  if (longEdge >= 6000) {
    return 1280;
  }
  if (longEdge >= 4500) {
    return 1536;
  }
  if (longEdge >= 3200) {
    return 1664;
  }
  return Math.min(longEdge, PHASE_REFINE_MAX_EDGE);
};

export const resolveCloudPreviewPolicy = (
  width: number,
  height: number,
  phase: CloudPreviewPhase,
): CloudPreviewPolicy => ({
  maxEdge: resolvePhaseMaxEdge(width, height, phase),
  qualityLadder: PREVIEW_QUALITY_LADDER,
});

const sanitizePickerBase64 = (input?: string): string => (input || '').replace(/^data:image\/\w+;base64,/, '');

const resizeImageForCloud = (
  image: SkImage,
  targetMaxEdge: number,
): {image: SkImage; width: number; height: number} => {
  const sourceWidth = image.width();
  const sourceHeight = image.height();
  const longEdge = Math.max(sourceWidth, sourceHeight);
  if (targetMaxEdge <= 0 || longEdge <= targetMaxEdge) {
    return {
      image,
      width: sourceWidth,
      height: sourceHeight,
    };
  }

  const scale = targetMaxEdge / longEdge;
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: 4,
    alphaType: 3,
  });

  if (!pixels || !(pixels instanceof Uint8Array) || pixels.length < width * height * 4) {
    return {
      image,
      width: sourceWidth,
      height: sourceHeight,
    };
  }

  const data = Skia.Data.fromBytes(pixels);
  const resized = Skia.Image.MakeImage(
    {
      width,
      height,
      colorType: 4,
      alphaType: 3,
    },
    data,
    width * 4,
  );

  if (!resized) {
    return {
      image,
      width: sourceWidth,
      height: sourceHeight,
    };
  }

  return {
    image: resized,
    width,
    height,
  };
};

const resolveScaledDimensions = (
  width: number,
  height: number,
  targetMaxEdge: number,
): {width: number; height: number} => {
  const longEdge = Math.max(width, height);
  if (targetMaxEdge <= 0 || longEdge <= targetMaxEdge) {
    return {width, height};
  }
  const scale = targetMaxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const encodeCloudPayload = (
  image: SkImage,
  width: number,
  height: number,
  phase: CloudPreviewPhase,
  fallbackBase64: string,
): CloudPreviewPayload => {
  const policy = resolveCloudPreviewPolicy(width, height, phase);
  const resized = resizeImageForCloud(image, policy.maxEdge);
  let selectedBase64 = '';
  let selectedBytes = 0;
  let selectedQuality = policy.qualityLadder[policy.qualityLadder.length - 1] || 76;

  for (const quality of policy.qualityLadder) {
    const encoded = resized.image.encodeToBase64(JPEG_FORMAT, quality);
    if (!encoded) {
      continue;
    }
    const payloadBytes = estimateBase64Bytes(encoded);
    selectedBase64 = encoded;
    selectedBytes = payloadBytes;
    selectedQuality = quality;
    if (payloadBytes <= CLOUD_MAX_BYTES) {
      break;
    }
  }

  if (!selectedBase64) {
    selectedBase64 = fallbackBase64;
    selectedBytes = estimateBase64Bytes(fallbackBase64);
  }

  return {
    mimeType: 'image/jpeg',
    width: resized.width,
    height: resized.height,
    base64: selectedBase64,
    payloadBytes: selectedBytes,
    encodeQuality: selectedQuality,
    maxEdgeApplied: policy.maxEdge,
  };
};

const computeImageStats = (image: SkImage): InterpretImageStats => {
  const sampleWidth = Math.max(24, Math.min(96, Math.floor(image.width() / 12)));
  const sampleHeight = Math.max(24, Math.min(96, Math.floor(image.height() / 12)));
  const pixelData = image.readPixels(0, 0, {
    width: sampleWidth,
    height: sampleHeight,
    colorType: 4,
    alphaType: 1,
  });

  if (!pixelData || !(pixelData instanceof Uint8Array) || pixelData.length < 4) {
    return buildNeutralStats();
  }

  const totalPixels = Math.floor(pixelData.length / 4);
  let lumaSum = 0;
  let lumaSqSum = 0;
  let satSum = 0;
  let highlightClip = 0;
  let shadowClip = 0;
  let skinCount = 0;
  let skyCount = 0;
  let greenCount = 0;

  for (let i = 0; i < pixelData.length; i += 4) {
    const r = pixelData[i] / 255;
    const g = pixelData[i + 1] / 255;
    const b = pixelData[i + 2] / 255;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

    lumaSum += luma;
    lumaSqSum += luma * luma;
    satSum += sat;

    if (luma > 0.95) {
      highlightClip += 1;
    }
    if (luma < 0.05) {
      shadowClip += 1;
    }

    if (r > 0.35 && g > 0.2 && b > 0.15 && r > g && g > b) {
      skinCount += 1;
    }
    if (b > 0.45 && b > r * 1.1 && b > g * 1.05) {
      skyCount += 1;
    }
    if (g > 0.35 && g > r * 1.05 && g > b * 1.05) {
      greenCount += 1;
    }
  }

  const lumaMean = lumaSum / totalPixels;
  const lumaVar = Math.max(0, lumaSqSum / totalPixels - lumaMean * lumaMean);
  return {
    lumaMean: Number(clamp01(lumaMean).toFixed(4)),
    lumaStd: Number(Math.sqrt(lumaVar).toFixed(4)),
    highlightClipPct: Number((highlightClip / totalPixels).toFixed(4)),
    shadowClipPct: Number((shadowClip / totalPixels).toFixed(4)),
    saturationMean: Number(clamp01(satSum / totalPixels).toFixed(4)),
    skinPct: Number((skinCount / totalPixels).toFixed(4)),
    skyPct: Number((skyCount / totalPixels).toFixed(4)),
    greenPct: Number((greenCount / totalPixels).toFixed(4)),
  };
};

export interface VoiceImageContext {
  image: InterpretImagePayload;
  imageStats: InterpretImageStats;
  cloudPayloads: {
    fast: CloudPreviewPayload;
    refine: CloudPreviewPayload;
  };
}

export const buildVoiceImageContext = (
  selectedImage: ImagePickerResult | null,
  skImage: SkImage | null,
): VoiceImageContext | null => {
  if (!selectedImage?.success || !skImage) {
    return null;
  }

  const sourceWidth = selectedImage.width || skImage.width();
  const sourceHeight = selectedImage.height || skImage.height();
  const originalBase64 = sanitizePickerBase64(selectedImage.base64);
  const refinePayload = encodeCloudPayload(
    skImage,
    sourceWidth,
    sourceHeight,
    'refine',
    originalBase64,
  );
  const fastPolicy = resolveCloudPreviewPolicy(sourceWidth, sourceHeight, 'fast');
  const fastScaled = resolveScaledDimensions(sourceWidth, sourceHeight, fastPolicy.maxEdge);
  const fastPayload: CloudPreviewPayload = {
    mimeType: 'image/jpeg',
    width: fastScaled.width,
    height: fastScaled.height,
    base64: '',
    payloadBytes: 0,
    encodeQuality: fastPolicy.qualityLadder[0] || 82,
    maxEdgeApplied: fastPolicy.maxEdge,
  };

  return {
    image: {
      mimeType: refinePayload.mimeType,
      width: refinePayload.width,
      height: refinePayload.height,
      base64: refinePayload.base64,
    },
    imageStats: computeImageStats(skImage),
    cloudPayloads: {
      fast: fastPayload,
      refine: refinePayload,
    },
  };
};
