import { ColorProfile } from './ColorProfile';

export interface ProcessingResult {
  uri: string;
  appliedProfile: ColorProfile;
  processingTime: number;
}

export interface ImageFilterParams {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  temperature: number;
  sepia: number;
  sharpen: number;
  blur: number;
}

export class ColorGradingEngine {
  private static instance: ColorGradingEngine;

  constructor() {
    if (ColorGradingEngine.instance) {
      return ColorGradingEngine.instance;
    }
    ColorGradingEngine.instance = this;
  }

  static getInstance(): ColorGradingEngine {
    if (!ColorGradingEngine.instance) {
      ColorGradingEngine.instance = new ColorGradingEngine();
    }
    return ColorGradingEngine.instance;
  }

  async processImage(
    imageUri: string,
    profile: ColorProfile
  ): Promise<ProcessingResult> {
    const startTime = Date.now();

    await new Promise<void>(resolve => setTimeout(resolve, 1500));

    const processingTime = Date.now() - startTime;

    return {
      uri: imageUri,
      appliedProfile: profile,
      processingTime,
    };
  }

  convertProfileToImageFilters(profile: ColorProfile): ImageFilterParams {
    return {
      brightness: 1 + profile.exposure / 100,
      contrast: 1 + profile.contrast / 100,
      saturation: 1 + profile.saturation / 100,
      hue: profile.hsl.h / 100,
      temperature: profile.temperature / 100,
      sepia: 0,
      sharpen: profile.clarity / 100,
      blur: 0,
    };
  }

  getProfileDescription(profile: ColorProfile): string {
    const descriptions: string[] = [];

    if (profile.exposure !== 0) {
      descriptions.push(`曝光${profile.exposure > 0 ? '+' : ''}${profile.exposure}`);
    }

    if (profile.contrast !== 0) {
      descriptions.push(`对比度${profile.contrast > 0 ? '+' : ''}${profile.contrast}`);
    }

    if (profile.saturation !== 0) {
      descriptions.push(`饱和度${profile.saturation > 0 ? '+' : ''}${profile.saturation}`);
    }

    if (profile.temperature !== 0) {
      descriptions.push(`色温${profile.temperature > 0 ? '+' : ''}${profile.temperature}`);
    }

    if (profile.tint !== 0) {
      descriptions.push(`色调${profile.tint > 0 ? '+' : ''}${profile.tint}`);
    }

    if (profile.highlights !== 0) {
      descriptions.push(`高光${profile.highlights > 0 ? '+' : ''}${profile.highlights}`);
    }

    if (profile.shadows !== 0) {
      descriptions.push(`阴影${profile.shadows > 0 ? '+' : ''}${profile.shadows}`);
    }

    if (profile.vibrance !== 0) {
      descriptions.push(`鲜艳度${profile.vibrance > 0 ? '+' : ''}${profile.vibrance}`);
    }

    if (profile.clarity !== 0) {
      descriptions.push(`清晰度${profile.clarity > 0 ? '+' : ''}${profile.clarity}`);
    }

    if (profile.dehaze !== 0) {
      descriptions.push(`去雾${profile.dehaze > 0 ? '+' : ''}${profile.dehaze}`);
    }

    return descriptions.length > 0 ? `已应用: ${descriptions.join('、')}` : '无调色效果';
  }
}

export default ColorGradingEngine;
