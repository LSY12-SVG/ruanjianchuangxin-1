import { ColorProfile } from './ColorProfile';

export interface ProcessingResult {
  uri: string;
  appliedProfile: ColorProfile;
  processingTime: number;
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

  getFilterLayers(profile: ColorProfile): FilterLayer[] {
    const layers: FilterLayer[] = [];

    if (profile.exposure !== 0) {
      layers.push(this.createExposureLayer(profile.exposure));
    }

    if (profile.contrast !== 0) {
      layers.push(this.createContrastLayer(profile.contrast));
    }

    if (profile.temperature !== 0) {
      layers.push(this.createTemperatureLayer(profile.temperature));
    }

    if (profile.tint !== 0) {
      layers.push(this.createTintLayer(profile.tint));
    }

    if (profile.saturation !== 0) {
      layers.push(this.createSaturationLayer(profile.saturation));
    }

    if (profile.highlights !== 0) {
      layers.push(this.createHighlightsLayer(profile.highlights, profile.highlightsTint));
    }

    if (profile.shadows !== 0) {
      layers.push(this.createShadowsLayer(profile.shadows, profile.shadowsTint));
    }

    if (profile.vibrance !== 0) {
      layers.push(this.createVibranceLayer(profile.vibrance));
    }

    if (profile.clarity !== 0) {
      layers.push(this.createClarityLayer(profile.clarity));
    }

    if (profile.dehaze !== 0) {
      layers.push(this.createDehazeLayer(profile.dehaze));
    }

    if (profile.hsl.h !== 0 || profile.hsl.s !== 0 || profile.hsl.l !== 0) {
      layers.push(this.createHSLLayer(profile.hsl));
    }

    if (profile.curves.overall.length > 0 || 
        profile.curves.rgb.r.length > 0 || 
        profile.curves.rgb.g.length > 0 || 
        profile.curves.rgb.b.length > 0) {
      layers.push(this.createCurvesLayer(profile.curves, profile.curveType));
    }

    return layers;
  }

  private createExposureLayer(exposure: number): FilterLayer {
    const intensity = Math.min(Math.abs(exposure) / 100, 0.4);
    const isPositive = exposure > 0;
    
    return {
      colors: isPositive 
        ? [`rgba(255, 255, 255, ${intensity})`, `rgba(255, 255, 255, ${intensity * 0.5})`, 'transparent']
        : [`rgba(0, 0, 0, ${intensity})`, `rgba(0, 0, 0, ${intensity * 0.5})`, 'transparent'],
      style: { opacity: 0.8 },
      blendMode: 'screen',
    };
  }

  private createContrastLayer(contrast: number): FilterLayer {
    const intensity = Math.min(Math.abs(contrast) / 100, 0.3);
    const isPositive = contrast > 0;
    
    return {
      colors: isPositive
        ? [`rgba(0, 0, 0, ${intensity})`, `rgba(255, 255, 255, ${intensity})`, 'transparent']
        : [`rgba(128, 128, 128, ${intensity})`, 'transparent'],
      style: { opacity: 0.6 },
      blendMode: 'overlay',
    };
  }

  private createTemperatureLayer(temperature: number): FilterLayer {
    const intensity = Math.min(Math.abs(temperature) / 100, 0.3);
    const isWarm = temperature > 0;
    
    return {
      colors: isWarm
        ? [`rgba(255, 200, 150, ${intensity})`, `rgba(255, 220, 180, ${intensity * 0.6})`, 'transparent']
        : [`rgba(150, 200, 255, ${intensity})`, `rgba(180, 220, 255, ${intensity * 0.6})`, 'transparent'],
      style: { opacity: 0.7 },
      blendMode: 'soft-light',
    };
  }

  private createTintLayer(tint: number): FilterLayer {
    const intensity = Math.min(Math.abs(tint) / 100, 0.25);
    const isPositive = tint > 0;
    
    return {
      colors: isPositive
        ? [`rgba(150, 255, 150, ${intensity})`, `rgba(200, 255, 200, ${intensity * 0.5})`, 'transparent']
        : [`rgba(255, 150, 150, ${intensity})`, `rgba(255, 200, 200, ${intensity * 0.5})`, 'transparent'],
      style: { opacity: 0.6 },
      blendMode: 'color',
    };
  }

  private createSaturationLayer(saturation: number): FilterLayer {
    const intensity = Math.min(Math.abs(saturation) / 100, 0.35);
    const isPositive = saturation > 0;
    
    return {
      colors: isPositive
        ? [`rgba(255, 255, 255, ${intensity})`, `rgba(255, 255, 255, ${intensity * 0.5})`, 'transparent']
        : [`rgba(128, 128, 128, ${intensity})`, `rgba(128, 128, 128, ${intensity * 0.5})`, 'transparent'],
      style: { opacity: 0.65 },
      blendMode: 'saturation',
    };
  }

  private createHighlightsLayer(highlights: number, tint: string): FilterLayer {
    const intensity = Math.min(Math.abs(highlights) / 100, 0.2);
    const isPositive = highlights > 0;
    
    let colors: string[];
    if (tint === 'orange') {
      colors = isPositive
        ? [`rgba(255, 200, 100, ${intensity})`, 'transparent']
        : [`rgba(100, 80, 50, ${intensity})`, 'transparent'];
    } else if (tint === 'yellow') {
      colors = isPositive
        ? [`rgba(255, 255, 150, ${intensity})`, 'transparent']
        : [`rgba(150, 150, 100, ${intensity})`, 'transparent'];
    } else if (tint === 'pink') {
      colors = isPositive
        ? [`rgba(255, 200, 220, ${intensity})`, 'transparent']
        : [`rgba(200, 150, 180, ${intensity})`, 'transparent'];
    } else {
      colors = isPositive
        ? [`rgba(255, 255, 255, ${intensity})`, 'transparent']
        : [`rgba(200, 200, 200, ${intensity})`, 'transparent'];
    }
    
    return {
      colors,
      style: { opacity: 0.5 },
      blendMode: 'screen',
    };
  }

  private createShadowsLayer(shadows: number, tint: string): FilterLayer {
    const intensity = Math.min(Math.abs(shadows) / 100, 0.2);
    const isPositive = shadows > 0;
    
    let colors: string[];
    if (tint === 'teal') {
      colors = isPositive
        ? [`rgba(0, 150, 150, ${intensity})`, 'transparent']
        : [`rgba(0, 100, 100, ${intensity})`, 'transparent'];
    } else if (tint === 'blue') {
      colors = isPositive
        ? [`rgba(0, 100, 200, ${intensity})`, 'transparent']
        : [`rgba(0, 80, 150, ${intensity})`, 'transparent'];
    } else if (tint === 'purple') {
      colors = isPositive
        ? [`rgba(100, 0, 150, ${intensity})`, 'transparent']
        : [`rgba(80, 0, 120, ${intensity})`, 'transparent'];
    } else {
      colors = isPositive
        ? [`rgba(50, 50, 50, ${intensity})`, 'transparent']
        : [`rgba(30, 30, 30, ${intensity})`, 'transparent'];
    }
    
    return {
      colors,
      style: { opacity: 0.5 },
      blendMode: 'multiply',
    };
  }

  private createVibranceLayer(vibrance: number): FilterLayer {
    const intensity = Math.min(Math.abs(vibrance) / 100, 0.2);
    const isPositive = vibrance > 0;
    
    return {
      colors: isPositive
        ? [`rgba(255, 255, 255, ${intensity})`, `rgba(255, 255, 255, ${intensity * 0.5})`, 'transparent']
        : [`rgba(100, 100, 100, ${intensity})`, `rgba(100, 100, 100, ${intensity * 0.5})`, 'transparent'],
      style: { opacity: 0.55 },
      blendMode: 'overlay',
    };
  }

  private createClarityLayer(clarity: number): FilterLayer {
    const intensity = Math.min(Math.abs(clarity) / 100, 0.15);
    const isPositive = clarity > 0;
    
    return {
      colors: isPositive
        ? [`rgba(255, 255, 255, ${intensity})`, 'transparent']
        : [`rgba(150, 150, 150, ${intensity})`, 'transparent'],
      style: { opacity: 0.4 },
      blendMode: 'soft-light',
    };
  }

  private createDehazeLayer(dehaze: number): FilterLayer {
    const intensity = Math.min(Math.abs(dehaze) / 100, 0.2);
    const isPositive = dehaze > 0;
    
    return {
      colors: isPositive
        ? [`rgba(200, 220, 255, ${intensity})`, `rgba(200, 220, 255, ${intensity * 0.5})`, 'transparent']
        : [`rgba(150, 170, 200, ${intensity})`, `rgba(150, 170, 200, ${intensity * 0.5})`, 'transparent'],
      style: { opacity: 0.5 },
      blendMode: 'screen',
    };
  }

  private createHSLLayer(hsl: { h: number; s: number; l: number }): FilterLayer {
    const layers: FilterLayer[] = [];
    
    if (hsl.h !== 0) {
      const intensity = Math.min(Math.abs(hsl.h) / 100, 0.2);
      const isPositive = hsl.h > 0;
      layers.push({
        colors: isPositive
          ? [`rgba(255, 100, 100, ${intensity})`, `rgba(255, 150, 150, ${intensity * 0.5})`, 'transparent']
          : [`rgba(100, 100, 255, ${intensity})`, `rgba(150, 150, 255, ${intensity * 0.5})`, 'transparent'],
        style: { opacity: 0.3 },
        blendMode: 'hue',
      });
    }
    
    if (hsl.s !== 0) {
      const intensity = Math.min(Math.abs(hsl.s) / 100, 0.2);
      const isPositive = hsl.s > 0;
      layers.push({
        colors: isPositive
          ? [`rgba(255, 255, 255, ${intensity})`, `rgba(255, 255, 255, ${intensity * 0.5})`, 'transparent']
          : [`rgba(128, 128, 128, ${intensity})`, `rgba(128, 128, 128, ${intensity * 0.5})`, 'transparent'],
        style: { opacity: 0.35 },
        blendMode: 'saturation',
      });
    }
    
    if (hsl.l !== 0) {
      const intensity = Math.min(Math.abs(hsl.l) / 100, 0.2);
      const isPositive = hsl.l > 0;
      layers.push({
        colors: isPositive
          ? [`rgba(255, 255, 255, ${intensity})`, 'transparent']
          : [`rgba(0, 0, 0, ${intensity})`, 'transparent'],
        style: { opacity: 0.4 },
        blendMode: 'screen',
      });
    }
    
    return layers[0] || layers[1] || layers[2];
  }

  private createCurvesLayer(curves: any, curveType: string): FilterLayer {
    if (curves.overall.length === 0 && 
        curves.rgb.r.length === 0 && 
        curves.rgb.g.length === 0 && 
        curves.rgb.b.length === 0) {
      return { colors: [], style: {} };
    }
    
    const intensity = 0.15;
    
    return {
      colors: [
        `rgba(0, 0, 0, ${intensity})`,
        `rgba(128, 128, 128, ${intensity * 0.5})`,
        `rgba(255, 255, 255, ${intensity})`,
        'transparent'
      ],
      style: { opacity: 0.3 },
      blendMode: 'overlay',
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

export interface FilterLayer {
  colors: string[];
  style?: any;
  blendMode?: string;
}

export default ColorGradingEngine;
