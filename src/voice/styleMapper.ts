import type {VoiceStyleTag} from './types';

export type CoreStyleVector = {
  exposure: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  redBalance: number;
  greenBalance: number;
  blueBalance: number;
  curve_master: number;
  curve_r: number;
  curve_g: number;
  curve_b: number;
  wheel_shadows: number;
  wheel_midtones: number;
  wheel_highlights: number;
};

const STYLE_VECTORS: Record<VoiceStyleTag, CoreStyleVector> = {
  cinematic_cool: {
    exposure: -0.05,
    brightness: -2,
    contrast: 20,
    highlights: -14,
    shadows: 14,
    whites: 4,
    blacks: -14,
    temperature: -22,
    tint: -6,
    vibrance: 12,
    saturation: 4,
    redBalance: -8,
    greenBalance: 0,
    blueBalance: 12,
    curve_master: 35,
    curve_r: -12,
    curve_g: 0,
    curve_b: 16,
    wheel_shadows: 18,
    wheel_midtones: 10,
    wheel_highlights: 8,
  },
  cinematic_warm: {
    exposure: 0.18,
    brightness: 6,
    contrast: 18,
    highlights: -18,
    shadows: 20,
    whites: 8,
    blacks: -12,
    temperature: 20,
    tint: 4,
    vibrance: 16,
    saturation: 8,
    redBalance: 8,
    greenBalance: -2,
    blueBalance: -8,
    curve_master: 30,
    curve_r: 10,
    curve_g: 0,
    curve_b: -10,
    wheel_shadows: 12,
    wheel_midtones: 16,
    wheel_highlights: 10,
  },
  portrait_clean: {
    exposure: 0.22,
    brightness: 8,
    contrast: -8,
    highlights: -28,
    shadows: 28,
    whites: 6,
    blacks: 4,
    temperature: 10,
    tint: 3,
    vibrance: 12,
    saturation: -4,
    redBalance: 6,
    greenBalance: -2,
    blueBalance: -4,
    curve_master: -12,
    curve_r: 10,
    curve_g: 0,
    curve_b: -6,
    wheel_shadows: 8,
    wheel_midtones: 14,
    wheel_highlights: 10,
  },
  vintage_fade: {
    exposure: 0.16,
    brightness: 10,
    contrast: -18,
    highlights: -26,
    shadows: 30,
    whites: 18,
    blacks: 14,
    temperature: 18,
    tint: 10,
    vibrance: -8,
    saturation: -22,
    redBalance: 12,
    greenBalance: 4,
    blueBalance: -12,
    curve_master: -28,
    curve_r: 12,
    curve_g: -6,
    curve_b: -18,
    wheel_shadows: 16,
    wheel_midtones: 14,
    wheel_highlights: 9,
  },
  moody_dark: {
    exposure: -0.2,
    brightness: -16,
    contrast: 16,
    highlights: -24,
    shadows: 8,
    whites: -6,
    blacks: -18,
    temperature: -8,
    tint: -2,
    vibrance: -12,
    saturation: -8,
    redBalance: -3,
    greenBalance: 0,
    blueBalance: 6,
    curve_master: 22,
    curve_r: -8,
    curve_g: 0,
    curve_b: 12,
    wheel_shadows: 20,
    wheel_midtones: 8,
    wheel_highlights: 4,
  },
  fresh_bright: {
    exposure: 0.25,
    brightness: 16,
    contrast: 10,
    highlights: -6,
    shadows: 14,
    whites: 10,
    blacks: -4,
    temperature: 6,
    tint: 0,
    vibrance: 18,
    saturation: 12,
    redBalance: 2,
    greenBalance: 4,
    blueBalance: 2,
    curve_master: 16,
    curve_r: 4,
    curve_g: 6,
    curve_b: 4,
    wheel_shadows: 6,
    wheel_midtones: 10,
    wheel_highlights: 8,
  },
};

export const mapStyleToVector = (
  style: VoiceStyleTag,
  strength: number = 1,
): CoreStyleVector => {
  const clampedStrength = Math.max(0, Math.min(1.5, strength));
  const base = STYLE_VECTORS[style] || STYLE_VECTORS.fresh_bright;
  return {
    exposure: Number((base.exposure * clampedStrength).toFixed(2)),
    brightness: Math.round(base.brightness * clampedStrength),
    contrast: Math.round(base.contrast * clampedStrength),
    highlights: Math.round(base.highlights * clampedStrength),
    shadows: Math.round(base.shadows * clampedStrength),
    whites: Math.round(base.whites * clampedStrength),
    blacks: Math.round(base.blacks * clampedStrength),
    temperature: Math.round(base.temperature * clampedStrength),
    tint: Math.round(base.tint * clampedStrength),
    vibrance: Math.round(base.vibrance * clampedStrength),
    saturation: Math.round(base.saturation * clampedStrength),
    redBalance: Math.round(base.redBalance * clampedStrength),
    greenBalance: Math.round(base.greenBalance * clampedStrength),
    blueBalance: Math.round(base.blueBalance * clampedStrength),
    curve_master: Math.round(base.curve_master * clampedStrength),
    curve_r: Math.round(base.curve_r * clampedStrength),
    curve_g: Math.round(base.curve_g * clampedStrength),
    curve_b: Math.round(base.curve_b * clampedStrength),
    wheel_shadows: Math.round(base.wheel_shadows * clampedStrength),
    wheel_midtones: Math.round(base.wheel_midtones * clampedStrength),
    wheel_highlights: Math.round(base.wheel_highlights * clampedStrength),
  };
};

export const matchStyleFromTranscript = (
  transcript: string,
): VoiceStyleTag | null => {
  const text = transcript.toLowerCase();

  if (
    text.includes('清冷') ||
    text.includes('冷色') ||
    text.includes('电影冷') ||
    text.includes('高级冷')
  ) {
    return 'cinematic_cool';
  }

  if (
    text.includes('暖色') ||
    text.includes('温暖') ||
    text.includes('日落') ||
    text.includes('电影暖')
  ) {
    return 'cinematic_warm';
  }

  if (
    text.includes('人像') ||
    text.includes('通透') ||
    text.includes('干净') ||
    text.includes('肤色') ||
    text.includes('柔光')
  ) {
    return 'portrait_clean';
  }

  if (
    text.includes('复古') ||
    text.includes('胶片') ||
    text.includes('怀旧') ||
    text.includes('老照片')
  ) {
    return 'vintage_fade';
  }

  if (
    text.includes('暗黑') ||
    text.includes('情绪') ||
    text.includes('压暗') ||
    text.includes('低沉') ||
    text.includes('低调')
  ) {
    return 'moody_dark';
  }

  if (text.includes('清新') || text.includes('明亮') || text.includes('通亮')) {
    return 'fresh_bright';
  }

  return null;
};
