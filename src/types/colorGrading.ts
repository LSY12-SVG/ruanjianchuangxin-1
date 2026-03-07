export type ToneCurvePoints = [number, number, number, number, number];

export interface ToneCurves {
  master: ToneCurvePoints;
  r: ToneCurvePoints;
  g: ToneCurvePoints;
  b: ToneCurvePoints;
}

export interface ColorWheelParams {
  hue: number; // -180 ~ 180
  sat: number; // 0 ~ 100
  luma: number; // -100 ~ 100
}

export interface ColorWheels {
  shadows: ColorWheelParams;
  midtones: ColorWheelParams;
  highlights: ColorWheelParams;
}

export interface ProColorParams {
  curves: ToneCurves;
  wheels: ColorWheels;
}

// 基础光影调整参数
export interface BasicLightParams {
  exposure: number; // 曝光度：-2.0 ~ 2.0
  contrast: number; // 对比度：-100 ~ 100
  brightness: number; // 亮度：-100 ~ 100
  highlights: number; // 高光：-100 ~ 100
  shadows: number; // 阴影：-100 ~ 100
  whites: number; // 白色色阶：-100 ~ 100
  blacks: number; // 黑色色阶：-100 ~ 100
}

// 色彩平衡调整参数
export interface ColorBalanceParams {
  temperature: number; // 色温：-100 ~ 100
  tint: number; // 色调：-100 ~ 100
  redBalance: number; // 红色平衡：-100 ~ 100
  greenBalance: number; // 绿色通道平衡：-100 ~ 100
  blueBalance: number; // 蓝色平衡：-100 ~ 100
  vibrance: number; // 色彩增强：-100 ~ 100
  saturation: number; // 饱和度：-100 ~ 100
}

// 完整调色参数
export interface ColorGradingParams {
  basic: BasicLightParams;
  colorBalance: ColorBalanceParams;
  pro: ProColorParams;
}

export type BasicParamKey = keyof BasicLightParams;
export type ColorBalanceParamKey = keyof ColorBalanceParams;
export type ProCurveParamKey = 'curve_master' | 'curve_r' | 'curve_g' | 'curve_b';
export type ProWheelParamKey = 'wheel_shadows' | 'wheel_midtones' | 'wheel_highlights';
export type ColorParamKey =
  | BasicParamKey
  | ColorBalanceParamKey
  | ProCurveParamKey
  | ProWheelParamKey;

export type VoiceControllableParam =
  | 'exposure'
  | 'brightness'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'whites'
  | 'blacks'
  | 'temperature'
  | 'tint'
  | 'saturation'
  | 'vibrance'
  | 'redBalance'
  | 'greenBalance'
  | 'blueBalance'
  | 'curve_master'
  | 'curve_r'
  | 'curve_g'
  | 'curve_b'
  | 'wheel_shadows'
  | 'wheel_midtones'
  | 'wheel_highlights';

export interface ColorParamSpec {
  module: 'basic' | 'colorBalance' | 'pro';
  label: string;
  min: number;
  max: number;
  step: number;
}

export const COLOR_PARAM_SPECS: Record<ColorParamKey, ColorParamSpec> = {
  exposure: {module: 'basic', label: '曝光', min: -2, max: 2, step: 0.05},
  brightness: {module: 'basic', label: '亮度', min: -100, max: 100, step: 1},
  contrast: {module: 'basic', label: '对比度', min: -100, max: 100, step: 1},
  highlights: {module: 'basic', label: '高光', min: -100, max: 100, step: 1},
  shadows: {module: 'basic', label: '阴影', min: -100, max: 100, step: 1},
  whites: {module: 'basic', label: '白色色阶', min: -100, max: 100, step: 1},
  blacks: {module: 'basic', label: '黑色色阶', min: -100, max: 100, step: 1},
  temperature: {module: 'colorBalance', label: '色温', min: -100, max: 100, step: 1},
  tint: {module: 'colorBalance', label: '色调', min: -100, max: 100, step: 1},
  saturation: {module: 'colorBalance', label: '饱和度', min: -100, max: 100, step: 1},
  vibrance: {module: 'colorBalance', label: '自然饱和度', min: -100, max: 100, step: 1},
  redBalance: {module: 'colorBalance', label: '红色通道', min: -100, max: 100, step: 1},
  greenBalance: {module: 'colorBalance', label: '绿色通道', min: -100, max: 100, step: 1},
  blueBalance: {module: 'colorBalance', label: '蓝色通道', min: -100, max: 100, step: 1},
  curve_master: {module: 'pro', label: '主曲线', min: -100, max: 100, step: 1},
  curve_r: {module: 'pro', label: '红曲线', min: -100, max: 100, step: 1},
  curve_g: {module: 'pro', label: '绿曲线', min: -100, max: 100, step: 1},
  curve_b: {module: 'pro', label: '蓝曲线', min: -100, max: 100, step: 1},
  wheel_shadows: {module: 'pro', label: '阴影色轮', min: -100, max: 100, step: 1},
  wheel_midtones: {module: 'pro', label: '中间调色轮', min: -100, max: 100, step: 1},
  wheel_highlights: {module: 'pro', label: '高光色轮', min: -100, max: 100, step: 1},
};

// 预设数据结构
export interface ColorPreset {
  id: string;
  name: string;
  thumbnail?: string;
  params: ColorGradingParams;
  category:
    | 'cinematic'
    | 'portrait'
    | 'landscape'
    | 'artistic'
    | 'vintage'
    | 'custom';
  tags: string[];
  isAI?: boolean;
  aiModel?: string;
}

// 参数变更事件
export interface ParamChangeEvent {
  module: 'basic' | 'colorBalance' | 'pro';
  param: string;
  oldValue: number;
  newValue: number;
}

export const DEFAULT_CURVE_POINTS: ToneCurvePoints = [0, 0.25, 0.5, 0.75, 1];

export const defaultToneCurves: ToneCurves = {
  master: [...DEFAULT_CURVE_POINTS] as ToneCurvePoints,
  r: [...DEFAULT_CURVE_POINTS] as ToneCurvePoints,
  g: [...DEFAULT_CURVE_POINTS] as ToneCurvePoints,
  b: [...DEFAULT_CURVE_POINTS] as ToneCurvePoints,
};

export const defaultColorWheels: ColorWheels = {
  shadows: {hue: 0, sat: 0, luma: 0},
  midtones: {hue: 0, sat: 0, luma: 0},
  highlights: {hue: 0, sat: 0, luma: 0},
};

export const defaultProColorParams: ProColorParams = {
  curves: defaultToneCurves,
  wheels: defaultColorWheels,
};

// 默认参数值
export const defaultBasicLightParams: BasicLightParams = {
  exposure: 0,
  contrast: 0,
  brightness: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
};

export const defaultColorBalanceParams: ColorBalanceParams = {
  temperature: 0,
  tint: 0,
  redBalance: 0,
  greenBalance: 0,
  blueBalance: 0,
  vibrance: 0,
  saturation: 0,
};

export const defaultColorGradingParams: ColorGradingParams = {
  basic: {...defaultBasicLightParams},
  colorBalance: {...defaultColorBalanceParams},
  pro: {
    curves: {
      master: [...defaultToneCurves.master] as ToneCurvePoints,
      r: [...defaultToneCurves.r] as ToneCurvePoints,
      g: [...defaultToneCurves.g] as ToneCurvePoints,
      b: [...defaultToneCurves.b] as ToneCurvePoints,
    },
    wheels: {
      shadows: {...defaultColorWheels.shadows},
      midtones: {...defaultColorWheels.midtones},
      highlights: {...defaultColorWheels.highlights},
    },
  },
};

const curveFromIntensity = (intensity: number): ToneCurvePoints => {
  const t = Math.max(-1, Math.min(1, intensity));
  return [
    0,
    Math.max(0, Math.min(1, 0.25 - 0.11 * t)),
    Math.max(0, Math.min(1, 0.5 + 0.04 * t)),
    Math.max(0, Math.min(1, 0.75 + 0.11 * t)),
    1,
  ];
};

const makePreset = (params: Omit<ColorGradingParams, 'pro'> & {pro?: Partial<ProColorParams>}): ColorGradingParams => ({
  basic: params.basic,
  colorBalance: params.colorBalance,
  pro: {
    curves: {
      ...defaultToneCurves,
      ...(params.pro?.curves || {}),
    },
    wheels: {
      ...defaultColorWheels,
      ...(params.pro?.wheels || {}),
    },
  },
});

// 内置预设
export const BUILTIN_PRESETS: ColorPreset[] = [
  {
    id: 'preset_original',
    name: '原图',
    params: defaultColorGradingParams,
    category: 'custom',
    tags: ['默认'],
  },
  {
    id: 'preset_cinematic_warm',
    name: '电影暖色',
    params: makePreset({
      basic: {
        exposure: 0.18,
        contrast: 18,
        brightness: 6,
        highlights: -18,
        shadows: 20,
        whites: 8,
        blacks: -12,
      },
      colorBalance: {
        temperature: 20,
        tint: 4,
        redBalance: 8,
        greenBalance: -2,
        blueBalance: -8,
        vibrance: 16,
        saturation: 8,
      },
      pro: {
        curves: {
          master: curveFromIntensity(0.6),
          r: curveFromIntensity(0.2),
          g: [...DEFAULT_CURVE_POINTS] as ToneCurvePoints,
          b: curveFromIntensity(-0.2),
        },
        wheels: {
          shadows: {hue: -18, sat: 14, luma: -8},
          midtones: {hue: 24, sat: 20, luma: 5},
          highlights: {hue: 34, sat: 12, luma: 7},
        },
      },
    }),
    category: 'cinematic',
    tags: ['电影感', '暖色', '高对比度'],
  },
  {
    id: 'preset_cinematic_cool',
    name: '电影冷色',
    params: makePreset({
      basic: {
        exposure: -0.05,
        contrast: 20,
        brightness: -2,
        highlights: -14,
        shadows: 14,
        whites: 4,
        blacks: -14,
      },
      colorBalance: {
        temperature: -22,
        tint: -6,
        redBalance: -8,
        greenBalance: 0,
        blueBalance: 12,
        vibrance: 12,
        saturation: 4,
      },
      pro: {
        curves: {
          master: curveFromIntensity(0.5),
          r: curveFromIntensity(-0.2),
          g: [...DEFAULT_CURVE_POINTS] as ToneCurvePoints,
          b: curveFromIntensity(0.2),
        },
        wheels: {
          shadows: {hue: -32, sat: 24, luma: -10},
          midtones: {hue: -14, sat: 12, luma: -3},
          highlights: {hue: 8, sat: 8, luma: 2},
        },
      },
    }),
    category: 'cinematic',
    tags: ['电影感', '冷色', '青橙色调'],
  },
  {
    id: 'preset_portrait_soft',
    name: '人像柔光',
    params: makePreset({
      basic: {
        exposure: 0.22,
        contrast: -8,
        brightness: 8,
        highlights: -28,
        shadows: 28,
        whites: 6,
        blacks: 4,
      },
      colorBalance: {
        temperature: 10,
        tint: 3,
        redBalance: 6,
        greenBalance: -2,
        blueBalance: -4,
        vibrance: 12,
        saturation: -4,
      },
      pro: {
        curves: {
          master: curveFromIntensity(-0.2),
          r: curveFromIntensity(0.2),
          g: [...DEFAULT_CURVE_POINTS] as ToneCurvePoints,
          b: curveFromIntensity(-0.1),
        },
        wheels: {
          shadows: {hue: -10, sat: 8, luma: 8},
          midtones: {hue: 18, sat: 16, luma: 6},
          highlights: {hue: 20, sat: 10, luma: 10},
        },
      },
    }),
    category: 'portrait',
    tags: ['人像', '柔光', '美颜'],
  },
  {
    id: 'preset_landscape_vivid',
    name: '风光鲜艳',
    params: makePreset({
      basic: {
        exposure: 0.12,
        contrast: 24,
        brightness: 5,
        highlights: -8,
        shadows: 12,
        whites: 16,
        blacks: -12,
      },
      colorBalance: {
        temperature: 6,
        tint: 0,
        redBalance: 4,
        greenBalance: 6,
        blueBalance: 2,
        vibrance: 28,
        saturation: 16,
      },
      pro: {
        curves: {
          master: curveFromIntensity(0.8),
          r: curveFromIntensity(0.1),
          g: curveFromIntensity(0.2),
          b: curveFromIntensity(0.1),
        },
        wheels: {
          shadows: {hue: -20, sat: 10, luma: -3},
          midtones: {hue: 14, sat: 18, luma: 6},
          highlights: {hue: 42, sat: 14, luma: 9},
        },
      },
    }),
    category: 'landscape',
    tags: ['风光', '鲜艳', '高饱和'],
  },
  {
    id: 'preset_vintage_fade',
    name: '复古褪色',
    params: makePreset({
      basic: {
        exposure: 0.16,
        contrast: -18,
        brightness: 10,
        highlights: -26,
        shadows: 30,
        whites: 18,
        blacks: 14,
      },
      colorBalance: {
        temperature: 18,
        tint: 10,
        redBalance: 12,
        greenBalance: 4,
        blueBalance: -12,
        vibrance: -8,
        saturation: -22,
      },
      pro: {
        curves: {
          master: curveFromIntensity(-0.45),
          r: curveFromIntensity(0.2),
          g: curveFromIntensity(-0.1),
          b: curveFromIntensity(-0.3),
        },
        wheels: {
          shadows: {hue: 26, sat: 18, luma: 7},
          midtones: {hue: 30, sat: 16, luma: 5},
          highlights: {hue: 35, sat: 10, luma: 4},
        },
      },
    }),
    category: 'vintage',
    tags: ['复古', '褪色', '胶片感'],
  },
];
