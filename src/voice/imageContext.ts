import {Skia, type SkImage} from '@shopify/react-native-skia';
import type {ImagePickerResult} from '../hooks/useImagePicker';
import type {InterpretImagePayload, InterpretImageStats} from './types';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const JPEG_FORMAT = 3;
const CLOUD_MAX_BYTES = 1_800_000;
const PREVIEW_QUALITY_LADDER = [84, 78, 72, 66, 58] as const;
const PHASE_FAST_MAX_EDGE = 1280;
const PHASE_REFINE_MAX_EDGE = 1664;
const MIN_PREVIEW_MAX_EDGE = 640;
const EDGE_REDUCE_FACTOR = 0.82;

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

const encodeCloudPayload = (
  image: SkImage,
  width: number,
  height: number,
  phase: CloudPreviewPhase,
  fallbackBase64: string,
): CloudPreviewPayload => {
  const policy = resolveCloudPreviewPolicy(width, height, phase);
  let selectedBase64 = '';
  let selectedBytes = 0;
  let selectedQuality = policy.qualityLadder[policy.qualityLadder.length - 1] || 76;
  let selectedWidth = width;
  let selectedHeight = height;
  let selectedMaxEdge = policy.maxEdge;
  let currentMaxEdge = policy.maxEdge;

  while (currentMaxEdge >= MIN_PREVIEW_MAX_EDGE) {
    const resized = resizeImageForCloud(image, currentMaxEdge);
    for (const quality of policy.qualityLadder) {
      const encoded = resized.image.encodeToBase64(JPEG_FORMAT, quality);
      if (!encoded) {
        continue;
      }
      const payloadBytes = estimateBase64Bytes(encoded);
      selectedBase64 = encoded;
      selectedBytes = payloadBytes;
      selectedQuality = quality;
      selectedWidth = resized.width;
      selectedHeight = resized.height;
      selectedMaxEdge = currentMaxEdge;
      if (payloadBytes <= CLOUD_MAX_BYTES) {
        return {
          mimeType: 'image/jpeg',
          width: selectedWidth,
          height: selectedHeight,
          base64: selectedBase64,
          payloadBytes: selectedBytes,
          encodeQuality: selectedQuality,
          maxEdgeApplied: selectedMaxEdge,
        };
      }
    }

    const nextMaxEdge = Math.max(
      MIN_PREVIEW_MAX_EDGE,
      Math.floor(currentMaxEdge * EDGE_REDUCE_FACTOR),
    );
    if (nextMaxEdge === currentMaxEdge) {
      break;
    }
    currentMaxEdge = nextMaxEdge;
  }

  if (!selectedBase64) {
    selectedBase64 = fallbackBase64;
    selectedBytes = estimateBase64Bytes(fallbackBase64);
    selectedWidth = width;
    selectedHeight = height;
    selectedMaxEdge = policy.maxEdge;
  }

  return {
    mimeType: 'image/jpeg',
    width: selectedWidth,
    height: selectedHeight,
    base64: selectedBase64,
    payloadBytes: selectedBytes,
    encodeQuality: selectedQuality,
    maxEdgeApplied: selectedMaxEdge,
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
  if (!selectedImage?.success) {
    return null;
  }

  const originalBase64 = sanitizePickerBase64(selectedImage.base64);
  if (!originalBase64) {
    return null;
  }

  const sourceWidth = Math.max(1, selectedImage.width || skImage?.width() || 1);
  const sourceHeight = Math.max(1, selectedImage.height || skImage?.height() || 1);

  if (!skImage) {
    const fallbackPayload: CloudPreviewPayload = {
      mimeType: selectedImage.type || 'image/jpeg',
      width: sourceWidth,
      height: sourceHeight,
      base64: originalBase64,
      payloadBytes: estimateBase64Bytes(originalBase64),
      encodeQuality: PREVIEW_QUALITY_LADDER[0],
      maxEdgeApplied: Math.max(sourceWidth, sourceHeight),
    };
    return {
      image: {
        mimeType: fallbackPayload.mimeType,
        width: fallbackPayload.width,
        height: fallbackPayload.height,
        base64: fallbackPayload.base64,
      },
      imageStats: buildNeutralStats(),
      cloudPayloads: {
        fast: fallbackPayload,
        refine: fallbackPayload,
      },
    };
  }

  const refinePayload = encodeCloudPayload(
    skImage,
    sourceWidth,
    sourceHeight,
    'refine',
    originalBase64,
  );
  const fastPayload = encodeCloudPayload(skImage, sourceWidth, sourceHeight, 'fast', originalBase64);

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
