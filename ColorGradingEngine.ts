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
      brightness: this.mapExposure(profile.exposure),
      contrast: this.mapContrast(profile.contrast),
      saturation: this.mapSaturation(profile.saturation),
      hue: this.mapHue(profile.hsl.h),
      temperature: this.mapTemperature(profile.temperature),
      sepia: this.mapSepia(profile),
      sharpen: this.mapClarity(profile.clarity),
      blur: this.mapBlur(profile),
    };
  }

  private mapExposure(exposure: number): number {
    if (exposure === 0) return 1.0;
    const normalized = Math.max(-100, Math.min(100, exposure));
    return 1 + (normalized / 100) * 0.4;
  }

  private mapContrast(contrast: number): number {
    if (contrast === 0) return 1.0;
    const normalized = Math.max(-100, Math.min(100, contrast));
    return 1 + (normalized / 100) * 0.5;
  }

  private mapSaturation(saturation: number): number {
    if (saturation === 0) return 1.0;
    const normalized = Math.max(-100, Math.min(100, saturation));
    return 1 + (normalized / 100) * 0.6;
  }

  private mapHue(hue: number): number {
    if (hue === 0) return 0;
    const normalized = Math.max(-100, Math.min(100, hue));
    return (normalized / 100) * 0.3;
  }

  private mapTemperature(temperature: number): number {
    if (temperature === 0) return 0;
    const normalized = Math.max(-100, Math.min(100, temperature));
    return (normalized / 100) * 0.5;
  }

  private mapSepia(profile: ColorProfile): number {
    if (profile.temperature > 50 && profile.saturation < -20) {
      return 0.15;
    }
    return 0;
  }

  private mapClarity(clarity: number): number {
    if (clarity === 0) return 0;
    const normalized = Math.max(-100, Math.min(100, clarity));
    return Math.max(0, (normalized / 100) * 0.3);
  }

  private mapBlur(profile: ColorProfile): number {
    if (profile.dehaze < -30) {
      return 0.5;
    }
    return 0;
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
