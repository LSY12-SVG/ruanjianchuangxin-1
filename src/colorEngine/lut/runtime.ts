import {Skia} from '@shopify/react-native-skia';
import type {SkImage} from '@shopify/react-native-skia';
import type {Lut3D} from '../../types/colorEngine';

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const toByte = (value: number): number => Math.round(clamp01(value) * 255);

const defaultDomainMin: [number, number, number] = [0, 0, 0];
const defaultDomainMax: [number, number, number] = [1, 1, 1];

export const buildIdentityLut = (
  size = 16,
  id = 'lut_identity_16',
  name = 'Identity 16',
): Lut3D => {
  const data: number[] = [];
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        data.push(r / (size - 1), g / (size - 1), b / (size - 1));
      }
    }
  }

  return {
    id,
    name,
    size,
    domainMin: defaultDomainMin,
    domainMax: defaultDomainMax,
    data,
  };
};

export const buildFilmicLut = (
  size = 16,
  id = 'lut_filmic_soft_16',
  name = 'Filmic Soft 16',
): Lut3D => {
  const data: number[] = [];
  const tone = (x: number) => x / (x + 0.28);

  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        let rr = tone(r / (size - 1));
        let gg = tone(g / (size - 1));
        let bb = tone(b / (size - 1));

        // Slight teal/orange cross curve for pleasing skin/sky split.
        const luma = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
        rr = clamp01(rr * (1.02 + luma * 0.04));
        gg = clamp01(gg * 1.01);
        bb = clamp01(bb * (0.95 + (1 - luma) * 0.03));

        data.push(rr, gg, bb);
      }
    }
  }

  return {
    id,
    name,
    size,
    domainMin: defaultDomainMin,
    domainMax: defaultDomainMax,
    data,
  };
};

export interface LutStripPixels {
  width: number;
  height: number;
  bytesPerRow: number;
  pixels: Uint8Array;
}

export const lutToStripPixels = (lut: Lut3D): LutStripPixels => {
  const size = Math.max(2, lut.size);
  const width = size * size;
  const height = size;
  const pixels = new Uint8Array(width * height * 4);

  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const srcIndex = ((b * size * size + g * size + r) * 3) | 0;
        const x = b * size + r;
        const y = g;
        const dstIndex = ((y * width + x) * 4) | 0;

        pixels[dstIndex] = toByte(lut.data[srcIndex] || 0);
        pixels[dstIndex + 1] = toByte(lut.data[srcIndex + 1] || 0);
        pixels[dstIndex + 2] = toByte(lut.data[srcIndex + 2] || 0);
        pixels[dstIndex + 3] = 255;
      }
    }
  }

  return {
    width,
    height,
    bytesPerRow: width * 4,
    pixels,
  };
};

export interface LutRuntimeTexture {
  image: SkImage | null;
  size: number;
  width: number;
  height: number;
}

export const createLutRuntimeTexture = (lut: Lut3D): LutRuntimeTexture => {
  const strip = lutToStripPixels(lut);
  try {
    const data = Skia.Data.fromBytes(strip.pixels);
    const colorType = (Skia as unknown as {ColorType?: {RGBA_8888?: number}}).ColorType
      ?.RGBA_8888 ?? 4;
    const alphaType = (Skia as unknown as {AlphaType?: {Unpremul?: number}}).AlphaType
      ?.Unpremul ?? 3;
    const image = Skia.Image.MakeImage(
      {
        width: strip.width,
        height: strip.height,
        colorType,
        alphaType,
      },
      data,
      strip.bytesPerRow,
    );

    return {
      image,
      size: Math.max(2, lut.size),
      width: strip.width,
      height: strip.height,
    };
  } catch {
    return {
      image: null,
      size: Math.max(2, lut.size),
      width: strip.width,
      height: strip.height,
    };
  }
};

