import type {ColorGradingParams} from '../types/colorGrading';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const identityMatrix = (): number[] => [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

const multiplyColorMatrices = (next: number[], base: number[]): number[] => {
  const out = new Array<number>(20).fill(0);
  for (let row = 0; row < 4; row += 1) {
    const rowOffset = row * 5;
    for (let col = 0; col < 4; col += 1) {
      out[rowOffset + col] =
        next[rowOffset] * base[col] +
        next[rowOffset + 1] * base[5 + col] +
        next[rowOffset + 2] * base[10 + col] +
        next[rowOffset + 3] * base[15 + col];
    }
    out[rowOffset + 4] =
      next[rowOffset] * base[4] +
      next[rowOffset + 1] * base[9] +
      next[rowOffset + 2] * base[14] +
      next[rowOffset + 3] * base[19] +
      next[rowOffset + 4];
  }
  return out;
};

const scaleTranslateMatrix = (
  scaleR: number,
  scaleG: number,
  scaleB: number,
  shiftR = 0,
  shiftG = 0,
  shiftB = 0,
): number[] => [
  scaleR, 0, 0, 0, shiftR,
  0, scaleG, 0, 0, shiftG,
  0, 0, scaleB, 0, shiftB,
  0, 0, 0, 1, 0,
];

const saturationMatrix = (saturation: number): number[] => {
  const s = clamp(saturation, 0, 3);
  const inv = 1 - s;
  const r = 0.2126 * inv;
  const g = 0.7152 * inv;
  const b = 0.0722 * inv;
  return [
    r + s, g, b, 0, 0,
    r, g + s, b, 0, 0,
    r, g, b + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

const resolveToneCompensation = (params: ColorGradingParams): {contrast: number; brightness: number} => {
  const {highlights, shadows, whites, blacks, brightness} = params.basic;
  const contrastShift = (highlights + whites - shadows - blacks) * 0.15;
  const brightnessShift = brightness + (shadows - highlights) * 0.12 + (whites - blacks) * 0.08;
  return {
    contrast: contrastShift,
    brightness: brightnessShift,
  };
};

const resolveColorCompensation = (params: ColorGradingParams): {
  scaleR: number;
  scaleG: number;
  scaleB: number;
} => {
  const {
    temperature,
    tint,
    redBalance,
    greenBalance,
    blueBalance,
  } = params.colorBalance;
  const t = temperature / 100;
  const m = tint / 100;
  return {
    scaleR: clamp(1 + redBalance * 0.004 + t * 0.14 + m * 0.06, 0.4, 1.8),
    scaleG: clamp(1 + greenBalance * 0.004 - m * 0.1, 0.4, 1.8),
    scaleB: clamp(1 + blueBalance * 0.004 - t * 0.14 + m * 0.06, 0.4, 1.8),
  };
};

export const buildPreviewColorMatrix = (params: ColorGradingParams): number[] => {
  const matrix = identityMatrix();
  let current = matrix;

  const exposureScale = clamp(Math.pow(2, clamp(params.basic.exposure, -2, 2)), 0.2, 4);
  current = multiplyColorMatrices(
    scaleTranslateMatrix(exposureScale, exposureScale, exposureScale),
    current,
  );

  const tone = resolveToneCompensation(params);
  const contrast = clamp(1 + (params.basic.contrast + tone.contrast) / 100, 0.2, 2.4);
  const brightnessOffset = clamp((tone.brightness / 100) * 0.32, -0.32, 0.32);
  current = multiplyColorMatrices(
    scaleTranslateMatrix(
      contrast,
      contrast,
      contrast,
      0.5 * (1 - contrast) + brightnessOffset,
      0.5 * (1 - contrast) + brightnessOffset,
      0.5 * (1 - contrast) + brightnessOffset,
    ),
    current,
  );

  const saturation =
    1 +
    clamp(params.colorBalance.saturation / 100, -1, 1) +
    clamp(params.colorBalance.vibrance / 100, -1, 1) * 0.55;
  current = multiplyColorMatrices(saturationMatrix(saturation), current);

  const colorScale = resolveColorCompensation(params);
  current = multiplyColorMatrices(
    scaleTranslateMatrix(colorScale.scaleR, colorScale.scaleG, colorScale.scaleB),
    current,
  );

  return current;
};
