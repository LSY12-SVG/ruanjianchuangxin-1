/**
 * 应用调色参数到图片样式
 * 注意：这是临时实现，后续会通过原生模块实现真实的图片处理
 */
import type {ColorGradingParams} from '../types/colorGrading';

export interface FilterStyle {
  filter?: string;
  opacity?: number;
}

/**
 * 将调色参数转换为 CSS filter 样式
 */
export const applyColorGradingToStyle = (
  params: ColorGradingParams
): FilterStyle => {
  const filters: string[] = [];

  // 基础光影调整
  if (params.basic.brightness !== 0) {
    // 亮度调整 (0-100 映射到 0-2)
    const brightness = 1 + params.basic.brightness / 100;
    filters.push(`brightness(${brightness})`);
  }

  if (params.basic.contrast !== 0) {
    // 对比度调整
    const contrast = 1 + params.basic.contrast / 100;
    filters.push(`contrast(${contrast})`);
  }

  if (params.basic.saturation !== 0) {
    // 饱和度调整
    const saturation = 1 + params.basic.saturation / 100;
    filters.push(`saturate(${saturation})`);
  }

  if (params.basic.exposure !== 0) {
    // 曝光度（使用 brightness 近似）
    const exposure = 1 + params.basic.exposure / 2;
    filters.push(`brightness(${exposure})`);
  }

  // 色温调整（使用 sepia 和 hue-rotate 近似）
  if (params.colorBalance.temperature !== 0) {
    const temp = params.colorBalance.temperature;
    if (temp > 0) {
      // 暖色调
      filters.push(`sepia(${Math.abs(temp) / 200})`);
    } else {
      // 冷色调（降低色温）
      filters.push(`hue-rotate(${temp / 2}deg)`);
    }
  }

  // 色调调整
  if (params.colorBalance.tint !== 0) {
    filters.push(`hue-rotate(${params.colorBalance.tint / 5}deg)`);
  }

  if (filters.length === 0) {
    return {};
  }

  return {
    filter: filters.join(' '),
  };
};

/**
 * 计算调整后的图片 URI（用于保存）
 * 注意：这是占位实现，后续会使用原生图片处理
 */
export const processImage = async (
  uri: string,
  params: ColorGradingParams
): Promise<string> => {
  // TODO: 使用原生模块处理图片
  // 目前返回原图 URI
  return uri;
};

/**
 * 保存图片到相册
 */
export const saveImageToGallery = async (uri: string): Promise<boolean> => {
  try {
    // TODO: 使用 react-native-view-shot 或 CameraRoll 保存图片
    console.log('保存图片:', uri);
    return true;
  } catch (error) {
    console.error('保存图片失败:', error);
    return false;
  }
};

/**
 * 获取图片尺寸
 */
export const getImageDimensions = async (
  uri: string
): Promise<{width: number; height: number}> => {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Image = require('react-native').Image;
    Image.getSize(
      uri,
      (width, height) => resolve({width, height}),
      (error) => reject(error)
    );
  });
};

/**
 * 压缩图片
 */
export const compressImage = async (
  uri: string,
  quality: number = 0.8
): Promise<string> => {
  // TODO: 使用原生模块压缩图片
  return uri;
};
