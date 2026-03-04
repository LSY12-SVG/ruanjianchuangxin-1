import {Skia, SkImage, SkSurface, ImageFormat, ColorMatrix} from '@shopify/react-native-skia';
import {decode as atob} from 'base-64';
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
 * @param imageUri 图片 URI (file:// 或 http://) 或 base64 数据
 * @param params 调色参数
 * @param base64Data 可选的 base64 图片数据（如果提供则优先使用）
 * @returns 处理后的图片 Base64
 */
export const processImageWithSkia = async (
  imageUri: string,
  params: ColorGradingParams,
  base64Data?: string
): Promise<string> => {
  // 调试：检查 Skia 是否正确注册 - 放在 try 外面确保一定会执行
  console.log('=== Skia Debug Start ===');
  console.log('Skia:', Skia);
  console.log('Skia.Surface:', Skia.Surface);
  console.log('Skia.Surface.MakeOffscreen:', Skia.Surface?.MakeOffscreen);
  console.log('Skia.Image:', Skia.Image);
  console.log('Skia.Image.MakeImageFromEncoded:', Skia.Image?.MakeImageFromEncoded);
  console.log('Skia.Data:', Skia.Data);
  console.log('Skia.Data.fromBytes:', Skia.Data?.fromBytes);
  console.log('=== Skia Debug End ===');
  
  try {
    let skImage: SkImage | null = null;
    
    // 如果提供了 base64 数据，优先使用
    if (base64Data && base64Data.length > 0) {
      console.log('base64Data length:', base64Data.length);
      
      // 移除可能的前缀
      const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');
      console.log('Clean base64 length:', base64String.length);
      
      // 使用 base-64 polyfill
      const binaryString = atob(base64String);
      console.log('Binary string length:', binaryString.length);
      
      const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
      console.log('Uint8Array length:', bytes.length);
      console.log('First 20 bytes:', Array.from(bytes.slice(0, 20)));
      
      // ✅ 正确写法：先转换为 Skia.Data
      console.log('Creating Skia.Data.fromBytes...');
      const data = Skia.Data.fromBytes(bytes);
      console.log('Skia.Data created:', data);
      
      // 使用 Skia.Image.MakeImageFromEncoded 解码
      console.log('Calling Skia.Image.MakeImageFromEncoded(data)...');
      skImage = Skia.Image.MakeImageFromEncoded(data);
      console.log('Success! Image:', skImage);
    } else if (imageUri.startsWith('file://')) {
      // 本地文件
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(new Error('FileReader 读取失败'));
        reader.readAsArrayBuffer(blob);
      });
      
      skImage = Skia.Image.MakeImageFromEncoded(new Uint8Array(arrayBuffer));
    } else {
      // 网络图片
      const response = await fetch(imageUri);
      const buffer = await response.arrayBuffer();
      skImage = Skia.Image.MakeImageFromEncoded(new Uint8Array(buffer));
    }
    
    if (!skImage) {
      throw new Error('Failed to load image');
    }
    
    // 创建 surface（使用标准写法）
    const surface = Skia.Surface.MakeOffscreen(
      skImage.width(),
      skImage.height()
    );
    
    console.log('surface:', surface);
    console.log('getCanvas method:', surface?.getCanvas);
    
    if (!surface) {
      throw new Error('Surface creation failed');
    }
    
    // 使用 getCanvas() 而不是 canvas()
    const canvas = surface.getCanvas();
    
    // 收集颜色矩阵
    const matrices: ColorMatrix[] = [];
    
    if (params.basic.brightness !== 0) {
      matrices.push(createBrightnessMatrix(params.basic.brightness));
    }
    if (params.basic.contrast !== 0) {
      matrices.push(createContrastMatrix(params.basic.contrast));
    }
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
      const encodedImage = skImage.encodeToBase64();
      return `data:image/png;base64,${encodedImage}`;
    }
    
    // 组合矩阵
    const combinedMatrix = composeColorMatrices(matrices);
    
    // 使用标准写法：Skia.ColorFilter.MakeMatrix
    const paint = Skia.Paint();
    const colorFilter = Skia.ColorFilter.MakeMatrix(combinedMatrix);
    paint.setColorFilter(colorFilter);
    
    // 绘制处理后的图像
    canvas.drawImage(skImage, 0, 0, paint);
    
    // 生成结果（使用标准写法）
    const snapshot = surface.makeImageSnapshot();
    const encodedImage = snapshot.encodeToBase64();
    
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
