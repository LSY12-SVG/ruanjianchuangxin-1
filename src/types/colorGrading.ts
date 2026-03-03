// 基础光影调整参数
export interface BasicLightParams {
  exposure: number;      // 曝光度：-2.0 ~ 2.0
  contrast: number;      // 对比度：-100 ~ 100
  brightness: number;    // 亮度：-100 ~ 100
  highlights: number;    // 高光：-100 ~ 100
  shadows: number;       // 阴影：-100 ~ 100
  whites: number;        // 白色色阶：-100 ~ 100
  blacks: number;        // 黑色色阶：-100 ~ 100
}

// 色彩平衡调整参数
export interface ColorBalanceParams {
  temperature: number;   // 色温：-100 ~ 100
  tint: number;          // 色调：-100 ~ 100
  redBalance: number;    // 红色平衡：-100 ~ 100
  greenBalance: number;  // 绿色通道平衡：-100 ~ 100
  blueBalance: number;   // 蓝色平衡：-100 ~ 100
  vibrance: number;      // 色彩增强：-100 ~ 100
  saturation: number;    // 饱和度：-100 ~ 100
}

// 完整调色参数（Phase 1: 基础调色）
export interface ColorGradingParams {
  basic: BasicLightParams;
  colorBalance: ColorBalanceParams;
}

// 预设数据结构
export interface ColorPreset {
  id: string;
  name: string;
  thumbnail?: string;
  params: ColorGradingParams;
  category: 'cinematic' | 'portrait' | 'landscape' | 'artistic' | 'vintage' | 'custom';
  tags: string[];
  isAI?: boolean;
  aiModel?: string;
}

// 参数变更事件
export interface ParamChangeEvent {
  module: 'basic' | 'colorBalance';
  param: string;
  oldValue: number;
  newValue: number;
}

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
  basic: defaultBasicLightParams,
  colorBalance: defaultColorBalanceParams,
};

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
    params: {
      basic: {
        exposure: 0.1,
        contrast: 15,
        brightness: 5,
        highlights: -10,
        shadows: 20,
        whites: 10,
        blacks: -5,
      },
      colorBalance: {
        temperature: 15,
        tint: 5,
        redBalance: 10,
        greenBalance: 0,
        blueBalance: -10,
        vibrance: 20,
        saturation: 10,
      },
    },
    category: 'cinematic',
    tags: ['电影感', '暖色', '高对比度'],
  },
  {
    id: 'preset_cinematic_cool',
    name: '电影冷色',
    params: {
      basic: {
        exposure: -0.1,
        contrast: 20,
        brightness: 0,
        highlights: -15,
        shadows: 15,
        whites: 5,
        blacks: -10,
      },
      colorBalance: {
        temperature: -20,
        tint: -5,
        redBalance: -10,
        greenBalance: 0,
        blueBalance: 15,
        vibrance: 15,
        saturation: 5,
      },
    },
    category: 'cinematic',
    tags: ['电影感', '冷色', '青橙色调'],
  },
  {
    id: 'preset_portrait_soft',
    name: '人像柔光',
    params: {
      basic: {
        exposure: 0.2,
        contrast: -10,
        brightness: 10,
        highlights: -20,
        shadows: 25,
        whites: 5,
        blacks: 5,
      },
      colorBalance: {
        temperature: 8,
        tint: 3,
        redBalance: 5,
        greenBalance: 0,
        blueBalance: -5,
        vibrance: 10,
        saturation: -5,
      },
    },
    category: 'portrait',
    tags: ['人像', '柔光', '美颜'],
  },
  {
    id: 'preset_landscape_vivid',
    name: '风光鲜艳',
    params: {
      basic: {
        exposure: 0.1,
        contrast: 25,
        brightness: 5,
        highlights: -5,
        shadows: 10,
        whites: 15,
        blacks: -10,
      },
      colorBalance: {
        temperature: 5,
        tint: 0,
        redBalance: 5,
        greenBalance: 5,
        blueBalance: 0,
        vibrance: 35,
        saturation: 20,
      },
    },
    category: 'landscape',
    tags: ['风光', '鲜艳', '高饱和'],
  },
  {
    id: 'preset_vintage_fade',
    name: '复古褪色',
    params: {
      basic: {
        exposure: 0.15,
        contrast: -20,
        brightness: 10,
        highlights: -30,
        shadows: 30,
        whites: 20,
        blacks: 15,
      },
      colorBalance: {
        temperature: 20,
        tint: 10,
        redBalance: 15,
        greenBalance: 5,
        blueBalance: -10,
        vibrance: -10,
        saturation: -25,
      },
    },
    category: 'vintage',
    tags: ['复古', '褪色', '胶片感'],
  },
];
