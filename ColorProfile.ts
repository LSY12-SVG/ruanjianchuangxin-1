export interface HSLParams {
  h: number;
  s: number;
  l: number;
}

export interface CurveParams {
  rgb: {
    r: number[];
    g: number[];
    b: number[];
  };
  overall: number[];
}

export interface ColorProfile {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
  hsl: HSLParams;
  curves: CurveParams;
  curveType: 'S' | 'M' | 'C' | 'linear';
  shadowsTint: 'teal' | 'blue' | 'purple' | 'none';
  highlightsTint: 'orange' | 'yellow' | 'pink' | 'none';
  vibrance: number;
  clarity: number;
  dehaze: number;
}

export interface PresetProfile {
  id: string;
  name: string;
  description: string;
  profile: ColorProfile;
}

export const DEFAULT_PROFILE: ColorProfile = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
  hsl: { h: 0, s: 0, l: 0 },
  curves: { rgb: { r: [], g: [], b: [] }, overall: [] },
  curveType: 'S',
  shadowsTint: 'none',
  highlightsTint: 'none',
  vibrance: 0,
  clarity: 0,
  dehaze: 0,
};

export const CINEMATIC_COOL_PRESET: PresetProfile = {
  id: 'cinematic_cool',
  name: '电影冷调',
  description: '电影级冷色调，阴影偏青蓝，高光偏暖，对比度提升',
  profile: {
    exposure: 0,
    contrast: 15,
    saturation: -5,
    temperature: -10,
    tint: 0,
    highlights: 5,
    shadows: -5,
    hsl: { h: 0, s: 0, l: 0 },
    curves: { rgb: { r: [], g: [], b: [] }, overall: [] },
    curveType: 'S',
    shadowsTint: 'teal',
    highlightsTint: 'orange',
    vibrance: 0,
    clarity: 0,
    dehaze: 0,
  },
};

export const VINTAGE_FILM_PRESET: PresetProfile = {
  id: 'vintage_film',
  name: '复古胶片',
  description: '经典复古质感，饱和度降低，色温提升，对比度降低，添加轻微颗粒',
  profile: {
    exposure: 0,
    contrast: -5,
    saturation: -15,
    temperature: 10,
    tint: 0,
    highlights: 0,
    shadows: 10,
    hsl: { h: 0, s: 0, l: 0 },
    curves: { rgb: { r: [], g: [], b: [] }, overall: [] },
    curveType: 'M',
    shadowsTint: 'none',
    highlightsTint: 'none',
    vibrance: 0,
    clarity: -10,
    dehaze: 0,
  },
};

export const JAPANESE_SOFT_PRESET: PresetProfile = {
  id: 'japanese_soft',
  name: '日系清新',
  description: '日系清新风格，曝光提升，对比度降低，饱和度降低，色温略暖，高光柔化',
  profile: {
    exposure: 10,
    contrast: -10,
    saturation: -10,
    temperature: 5,
    tint: 0,
    highlights: -5,
    shadows: 0,
    hsl: { h: 0, s: 0, l: 0 },
    curves: { rgb: { r: [], g: [], b: [] }, overall: [] },
    curveType: 'C',
    shadowsTint: 'none',
    highlightsTint: 'none',
    vibrance: 0,
    clarity: -5,
    dehaze: 0,
  },
};

export const PRESETS: PresetProfile[] = [
  CINEMATIC_COOL_PRESET,
  VINTAGE_FILM_PRESET,
  JAPANESE_SOFT_PRESET,
];

export function mergeProfiles(base: ColorProfile, overlay: Partial<ColorProfile>): ColorProfile {
  return {
    ...base,
    ...overlay,
    hsl: { ...base.hsl, ...overlay.hsl },
    curves: {
      rgb: {
        r: [...base.curves.rgb.r, ...(overlay.curves?.rgb?.r || [])],
        g: [...base.curves.rgb.g, ...(overlay.curves?.rgb?.g || [])],
        b: [...base.curves.rgb.b, ...(overlay.curves?.rgb?.b || [])],
      },
      overall: [...base.curves.overall, ...(overlay.curves?.overall || [])],
    },
  };
}

export function profileToJSON(profile: ColorProfile): string {
  return JSON.stringify(profile, null, 2);
}

export function profileFromJSON(json: string): ColorProfile {
  try {
    return JSON.parse(json);
  } catch {
    return DEFAULT_PROFILE;
  }
}
