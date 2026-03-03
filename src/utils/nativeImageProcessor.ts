import {Skia, SkImage, SkSurface, ImageFormat, ColorMatrix} from '@shopify/react-native-skia';
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
 */
export const composeColorMatrices = (matrices: ColorMatrix[]): ColorMatrix => {
  if (matrices.length === 0) {
    return [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  }
  
  let result = matrices[0];
  
  for (let i = 1; i < matrices.length; i++) {
    const matrix = matrices[i];
    const newResult: ColorMatrix = [];
    
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 5; col++) {
        let value = 0;
        for (let k = 0; k < 4; k++) {
          value += result[row * 5 + k] * matrix[k * 5 + col];
        }
        if (col === 4) {
          value += result[row * 5 + 4];
        }
        newResult[row * 5 + col] = value;
      }
    }
    
    result = newResult;
  }
  
  return result;
};

/**
 * 使用 Skia 处理图片
 * @param imageUri 图片 URI
 * @param params 调色参数
 * @returns 处理后的图片 Base64
 */
export const processImageWithSkia = async (
  imageUri: string,
  params: ColorGradingParams
): Promise<string> => {
  try {
    // 加载原始图片
    const imageData = await fetch(imageUri).then(res => res.arrayBuffer());
    const skImage = Skia.MakeImageFromEncoded(new Uint8Array(imageData));
    
    if (!skImage) {
      throw new Error('Failed to load image');
    }
    
    // 创建离屏表面
    const surface = Skia.Surface.MakeOffscreen(skImage.width(), skImage.height());
    if (!surface) {
      throw new Error('Failed to create surface');
    }
    
    const canvas = surface.canvas();
    
    // 组合所有颜色矩阵
    const matrices: ColorMatrix[] = [];
    
    // 基础光影调整
    if (params.basic.brightness !== 0) {
      matrices.push(createBrightnessMatrix(params.basic.brightness));
    }
    if (params.basic.contrast !== 0) {
      matrices.push(createContrastMatrix(params.basic.contrast));
    }
    
    // 色彩平衡调整
    if (params.colorBalance.temperature !== 0) {
      matrices.push(createTemperatureMatrix(params.colorBalance.temperature));
    }
    if (params.colorBalance.tint !== 0) {
      matrices.push(createTintMatrix(params.colorBalance.tint));
    }
    if (params.colorBalance.saturation !== 0) {
      matrices.push(createSaturationMatrix(params.colorBalance.saturation));
    }
    
    // 如果没有调整，直接返回原图
    if (matrices.length === 0) {
      const encodedImage = skImage.encodeToBase64(ImageFormat.PNG, 100);
      return `data:image/png;base64,${encodedImage}`;
    }
    
    // 组合矩阵
    const combinedMatrix = composeColorMatrices(matrices);
    
    // 应用颜色矩阵滤镜
    const paint = Skia.Paint();
    const colorFilter = Skia.ColorMatrixColorFilter.Make(combinedMatrix);
    paint.setColorFilter(colorFilter);
    
    // 绘制处理后的图像
    canvas.drawImage(skImage, 0, 0, paint);
    
    // 获取处理后的图像
    const processedImage = surface.makeImageSnapshot();
    const encodedImage = processedImage.encodeToBase64(ImageFormat.PNG, 90);
    
    return `data:image/png;base64,${encodedImage}`;
  } catch (error) {
    console.error('Error processing image with Skia:', error);
    throw error;
  }
};

/**
 * 保存图片到临时文件（用于分享或保存）
 * @param base64Image Base64 格式的图片数据
 * @returns 本地文件路径
 */
export const saveImageToTempFile = async (base64Image: string): Promise<string> => {
  // TODO: 实现保存到临时文件的功能
  // 可以使用 react-native-fs 库
  console.log('Saving image to temp file:', base64Image.substring(0, 50) + '...');
  return base64Image;
};
