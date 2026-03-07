export type Matrix = number[];

export const createExposureMatrix = (exposure: number): Matrix => {
  const clamped = Math.max(-2, Math.min(2, exposure));
  const factor = Math.pow(2, clamped);
  return [
    factor, 0, 0, 0, 0,
    0, factor, 0, 0, 0,
    0, 0, factor, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

export const createBrightnessMatrix = (brightness: number): Matrix => {
  const value = brightness / 100;
  return [
    1, 0, 0, 0, value,
    0, 1, 0, 0, value,
    0, 0, 1, 0, value,
    0, 0, 0, 1, 0,
  ];
};

export const createContrastMatrix = (contrast: number): Matrix => {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const intercept = 128 * (1 - factor);

  return [
    factor, 0, 0, 0, intercept / 255,
    0, factor, 0, 0, intercept / 255,
    0, 0, factor, 0, intercept / 255,
    0, 0, 0, 1, 0,
  ];
};

export const createSaturationMatrix = (saturation: number): Matrix => {
  const s = (100 + saturation) / 100;
  const r = 0.2126;
  const g = 0.7152;
  const b = 0.0722;

  return [
    (1 - s) * r + s, (1 - s) * g, (1 - s) * b, 0, 0,
    (1 - s) * r, (1 - s) * g + s, (1 - s) * b, 0, 0,
    (1 - s) * r, (1 - s) * g, (1 - s) * b + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

export const createTemperatureMatrix = (temperature: number): Matrix => {
  const temp = temperature / 100;
  const r = temp > 0 ? 1 + temp * 0.5 : 1 + temp * 0.3;
  const b = temp < 0 ? 1 - temp * 0.5 : 1 - temp * 0.3;

  return [
    r, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

export const createTintMatrix = (tint: number): Matrix => {
  const t = tint / 100;
  const g = 1 + t * 0.2;

  return [
    1, 0, 0, 0, t > 0 ? t * 50 : 0,
    0, g, 0, 0, 0,
    0, 0, 1, 0, t < 0 ? -t * 50 : 0,
    0, 0, 0, 1, 0,
  ];
};

export const composeColorMatrices = (matrices: Matrix[]): Matrix => {
  const identity: Matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  if (matrices.length === 0) {
    return identity;
  }

  if (matrices.length === 1) {
    return matrices[0];
  }

  const multiply4x5 = (a: Matrix, b: Matrix): Matrix => {
    const out: Matrix = new Array(20).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        out[row * 5 + col] =
          a[row * 5 + 0] * b[col + 0] +
          a[row * 5 + 1] * b[col + 5] +
          a[row * 5 + 2] * b[col + 10] +
          a[row * 5 + 3] * b[col + 15];
      }

      out[row * 5 + 4] =
        a[row * 5 + 0] * b[4] +
        a[row * 5 + 1] * b[9] +
        a[row * 5 + 2] * b[14] +
        a[row * 5 + 3] * b[19] +
        a[row * 5 + 4];
    }

    return out;
  };

  return matrices.reduce((acc, matrix) => multiply4x5(matrix, acc), identity);
};
