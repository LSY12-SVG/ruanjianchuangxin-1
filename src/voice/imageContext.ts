import {ImageFormat, type SkImage} from '@shopify/react-native-skia';
import type {ImagePickerResult} from '../hooks/useImagePicker';
import type {InterpretImagePayload, InterpretImageStats} from './types';

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

const buildNeutralStats = (): InterpretImageStats => ({
  lumaMean: 0.5,
  lumaStd: 0.2,
  highlightClipPct: 0.02,
  shadowClipPct: 0.02,
  saturationMean: 0.35,
});

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
}

export const buildVoiceImageContext = (
  selectedImage: ImagePickerResult | null,
  skImage: SkImage | null,
): VoiceImageContext | null => {
  if (!selectedImage?.success || !skImage || !selectedImage.base64) {
    return null;
  }

  const mimeType = selectedImage.type || 'image/jpeg';
  const originalBase64 = selectedImage.base64.replace(/^data:image\/\w+;base64,/, '');
  const encodedBase64 =
    mimeType.includes('jpeg') || mimeType.includes('jpg')
      ? skImage.encodeToBase64(ImageFormat.JPEG, 70) || originalBase64
      : skImage.encodeToBase64(ImageFormat.PNG, 100) || originalBase64;

  return {
    image: {
      mimeType,
      width: selectedImage.width || skImage.width(),
      height: selectedImage.height || skImage.height(),
      base64: encodedBase64,
    },
    imageStats: computeImageStats(skImage),
  };
};

