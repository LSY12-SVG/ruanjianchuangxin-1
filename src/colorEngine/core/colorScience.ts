export type Vec3 = [number, number, number];

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const eotfSrgb = (value: number): number => {
  const c = clamp01(value);
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return Math.pow((c + 0.055) / 1.055, 2.4);
};

export const oetfSrgb = (value: number): number => {
  const c = Math.max(0, value);
  if (c <= 0.0031308) {
    return c * 12.92;
  }
  return 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};

export const filmicSoftRollOff = (value: number): number => {
  const knee = 0.82;
  const shoulder = 2.6;
  if (value <= knee) {
    return value;
  }
  const t = clamp01((value - knee) / (1 - knee));
  const mapped = (1 - Math.exp(-shoulder * t)) / (1 - Math.exp(-shoulder));
  return knee + (1 - knee) * mapped;
};

export const applyHighlightRolloffFilmicSoft = (color: Vec3): Vec3 => {
  const peak = Math.max(color[0], color[1], color[2]);
  if (peak <= 0.82) {
    return color;
  }
  const mappedPeak = filmicSoftRollOff(peak);
  const ratio = mappedPeak / Math.max(peak, 1e-4);
  return [color[0] * ratio, color[1] * ratio, color[2] * ratio];
};

export const applyPerceptualGamutMapToSrgb = (color: Vec3): Vec3 => {
  const outOfGamut =
    color[0] < 0 || color[0] > 1 || color[1] < 0 || color[1] > 1 || color[2] < 0 || color[2] > 1;
  if (!outOfGamut) {
    return color;
  }

  const luma = clamp01(color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722);
  const chroma: Vec3 = [color[0] - luma, color[1] - luma, color[2] - luma];
  let maxScale = 1;

  chroma.forEach(component => {
    if (component > 1e-5) {
      maxScale = Math.min(maxScale, (1 - luma) / component);
    } else if (component < -1e-5) {
      maxScale = Math.min(maxScale, (0 - luma) / component);
    }
  });

  const scale = clamp01(maxScale * 0.95);
  return [
    clamp01(luma + chroma[0] * scale),
    clamp01(luma + chroma[1] * scale),
    clamp01(luma + chroma[2] * scale),
  ];
};
