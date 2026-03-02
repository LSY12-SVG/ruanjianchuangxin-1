import { ColorParams } from './NLPService';

export interface ProcessedImage {
  uri: string;
  appliedParams: ColorParams;
  processingTime: number;
}

export class ImageProcessingService {
  private static instance: ImageProcessingService;

  constructor() {
    if (ImageProcessingService.instance) {
      return ImageProcessingService.instance;
    }
    ImageProcessingService.instance = this;
  }

  static getInstance(): ImageProcessingService {
    if (!ImageProcessingService.instance) {
      ImageProcessingService.instance = new ImageProcessingService();
    }
    return ImageProcessingService.instance;
  }

  async processImage(
    imageUri: string,
    params: ColorParams
  ): Promise<ProcessedImage> {
    const startTime = Date.now();

    await new Promise<void>(resolve => setTimeout(resolve, 1500));

    const processingTime = Date.now() - startTime;

    return {
      uri: imageUri,
      appliedParams: params,
      processingTime,
    };
  }

  getFilterDescription(params: ColorParams): string {
    const descriptions: string[] = [];

    if (params.brightness) {
      const value = params.brightness > 1 ? '增加' : '降低';
      descriptions.push(`${value}亮度`);
    }

    if (params.contrast) {
      const value = params.contrast > 1 ? '增加' : '降低';
      descriptions.push(`${value}对比度`);
    }

    if (params.saturation) {
      const value = params.saturation > 1 ? '增加' : '降低';
      descriptions.push(`${value}饱和度`);
    }

    if (params.temperature) {
      const value = params.temperature > 1 ? '暖色调' : '冷色调';
      descriptions.push(value);
    }

    if (params.hue) {
      descriptions.push('色相调整');
    }

    if (params.exposure) {
      const value = params.exposure > 1 ? '增加' : '降低';
      descriptions.push(`${value}曝光`);
    }

    if (params.tint) {
      descriptions.push('色调调整');
    }

    if (params.vibrance) {
      const value = params.vibrance > 1 ? '增加' : '降低';
      descriptions.push(`${value}鲜艳度`);
    }

    if (params.shadows) {
      const value = params.shadows > 1 ? '提亮' : '压暗';
      descriptions.push(`${value}阴影`);
    }

    if (params.highlights) {
      const value = params.highlights > 1 ? '提亮' : '压暗';
      descriptions.push(`${value}高光`);
    }

    return descriptions.length > 0 
      ? `已应用: ${descriptions.join('、')}` 
      : '无滤镜效果';
  }

  async compareImages(
    originalUri: string,
    processedUri: string
  ): Promise<{ original: string; processed: string }> {
    return {
      original: originalUri,
      processed: processedUri,
    };
  }
}

export default ImageProcessingService;
