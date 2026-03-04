import type {ColorMatrix} from '@shopify/react-native-skia';
import type {ColorGradingParams} from '../types/colorGrading';

/**
 * 创建亮度颜色矩阵
 * @param brightness 亮度值 (-100 ~ 100)
 */
export const createBrightnessMatrix = (brightness: number): ColorMatrix => {
  const value = brightness / 100;
  return [
    1, 0, 0, 0, value,
    0, 1, 0, 0, value,
    0, 0, 1, 0, value,
    0, 0, 0, 1, 0,
  ];
};

/**
 * 创建对比度颜色矩阵
 * @param contrast 对比度值 (-100 ~ 100)
 */
export const createContrastMatrix = (contrast: number): ColorMatrix => {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  const intercept = 128 * (1 - factor);
  
  return [
    factor, 0, 0, 0, intercept / 255,
    0, factor, 0, 0, intercept / 255,
    0, 0, factor, 0, intercept / 255,
    0, 0, 0, 1, 0,
  ];
};

/**
 * 创建饱和度颜色矩阵
 * @param saturation 饱和度值 (-100 ~ 100)
 */
export const createSaturationMatrix = (saturation: number): ColorMatrix => {
  const s = (100 + saturation) / 100;
  const r = 0.2126;
  const g = 0.7152;
  const b = 0.0722;
  
  return [
    (1 - s) * r + s, (1 - s) * g, (1 - s) * b, 0, 0,
    (1 - s) * r, (1 - s) * g + s, (1 - s) * b, 0, 0,
    (1 - s) * r, (1 - s) * g, (1 - s) * b + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

/**
 * 创建色温颜色矩阵
 * @param temperature 色温值 (-100 ~ 100)
 */
export const createTemperatureMatrix = (temperature: number): ColorMatrix => {
  const temp = temperature / 100;
  const r = temp > 0 ? 1 + temp * 0.5 : 1 + temp * 0.3;
  const b = temp < 0 ? 1 - temp * 0.5 : 1 - temp * 0.3;
  
  return [
    r, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ];
};

/**
 * 创建色调颜色矩阵
 * @param tint 色调值 (-100 ~ 100)
 */
export const createTintMatrix = (tint: number): ColorMatrix => {
  const t = tint / 100;
  const g = 1 + t * 0.2;
  const m = 1 - t * 0.2;
  
  return [
    1, 0, 0, 0, t > 0 ? t * 50 : 0,
    0, g, 0, 0, 0,
    0, 0, 1, 0, t < 0 ? -t * 50 : 0,
    0, 0, 0, 1, 0,
  ];
};

/**
 * 组合多个颜色矩阵
 * 注意：ColorMatrix 是一个 4x5 的矩阵，用于颜色变换
 * 简单叠加各个矩阵的效果
 */
export const composeColorMatrices = (matrices: ColorMatrix[]): ColorMatrix => {
  if (matrices.length === 0) {
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  }
  
  if (matrices.length === 1) {
    return matrices[0];
  }
  
  // 从单位矩阵开始
  const result: ColorMatrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  
  // 依次应用每个矩阵
  for (const matrix of matrices) {
    const newResult: ColorMatrix = [];
    for (let i = 0; i < 20; i++) {
      newResult.push(matrix[i]);
    }
    
    // 组合矩阵：result = matrix * result
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        let value = 0;
        if (col < 4) {
          // 对于 RGB 通道，只做线性变换
          value = matrix[row * 5 + col] * result[col * 5 + col];
        } else {
          // 对于偏移量，累加
          value = result[row * 5 + 4] + matrix[row * 5 + 4];
        }
        newResult[row * 5 + col] = value;
      }
    }
    
    for (let i = 0; i < 20; i++) {
      result[i] = newResult[i];
    }
  }
  
  return result;
};
