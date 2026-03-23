import {useState, useCallback} from 'react';
import {Platform, PermissionsAndroid, NativeModules} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type ImageLibraryOptions,
  type CameraOptions,
} from 'react-native-image-picker';

export interface ImagePickerResult {
  success: boolean;
  uri?: string;
  width?: number;
  height?: number;
  fileName?: string;
  fileSize?: number;
  type?: string;
  base64?: string;
  originalPath?: string;
  nativeSourcePath?: string;
  workingSpaceHint?: 'linear_prophoto' | 'linear_srgb';
  decodeStrategy?: 'picker' | 'native_raw' | 'native_bitmap';
  isRaw?: boolean;
  bitDepthHint?: 8 | 10 | 12 | 14 | 16;
  error?: string;
}

interface ProColorEngineNativeModule {
  decodeSource?: (uri: string, maxDimension: number) => Promise<{
    width: number;
    height: number;
    previewBase64: string;
    nativeSourcePath: string;
    bitDepthHint: number;
    workingSpace: 'linear_prophoto' | 'linear_srgb';
    sourceType: string;
  }>;
}

const proColorEngine = NativeModules?.ProColorEngine as ProColorEngineNativeModule | undefined;

interface UseImagePickerOptions {
  onImageSelected?: (result: ImagePickerResult) => void;
  onImageError?: (error: string) => void;
  galleryOptions?: Partial<ImageLibraryOptions> & {
    conversionQuality?: number;
  };
  requireNativeDecodeForHeif?: boolean;
}

type ExtendedImageLibraryOptions = ImageLibraryOptions & {
  conversionQuality?: number;
};

const defaultPickerOptions: ExtendedImageLibraryOptions = {
  mediaType: 'photo',
  quality: 1,
  includeExtra: true,
  includeBase64: true,
  selectionLimit: 1,
  // 基础 RAW 支持：Android 端允许 DNG 与常见 RAW mime 类型选择
  restrictMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/x-adobe-dng',
    'image/x-canon-cr2',
    'image/x-nikon-nef',
    'image/x-sony-arw',
  ],
};

const cameraOptions: CameraOptions = {
  mediaType: 'photo',
  quality: 1,
  includeExtra: true,
  includeBase64: true,
  cameraType: 'back',
  saveToPhotos: true,
};

const processImageResult = async (
  result: any,
  {
    requireNativeDecodeForHeif = true,
  }: {
    requireNativeDecodeForHeif?: boolean;
  } = {},
): Promise<ImagePickerResult> => {
  if (result.didCancel) {
    return {success: false, error: '用户取消了选择'};
  }

  if (result.errorCode) {
    return {success: false, error: result.errorMessage || '选择图片失败'};
  }

  const asset = result.assets?.[0];
  if (!asset) {
    return {success: false, error: '未选择图片'};
  }

  const processedResult: ImagePickerResult = {
    success: true,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    type: asset.type,
    base64: asset.base64,
    originalPath: asset.originalPath,
    isRaw: Boolean(asset.type && /dng|cr2|nef|arw|raw/i.test(asset.type)),
    bitDepthHint: asset.type && /dng|cr2|nef|arw|raw/i.test(asset.type) ? 12 : 8,
  };

  const isHeif = Boolean(
    (asset.type && /heic|heif/i.test(asset.type)) ||
      (asset.fileName && /\.(heic|heif)$/i.test(asset.fileName)) ||
      (asset.uri && /\.(heic|heif)(\?|$)/i.test(asset.uri)),
  );
  const requiresNativeDecode =
    processedResult.isRaw || (isHeif && requireNativeDecodeForHeif);
  const canAttemptNativeDecode = Boolean(asset.uri && proColorEngine?.decodeSource);

  if (requiresNativeDecode && !canAttemptNativeDecode) {
    return {
      success: false,
      error: isHeif
        ? '当前设备缺少 HEIF 原生解码能力（需 Android 9+ ImageDecoder）。'
        : 'RAW 仅支持原生解码链路，请检查 Pro 引擎是否可用。',
    };
  }

  if (canAttemptNativeDecode && asset.uri && proColorEngine?.decodeSource) {
    try {
      const nativeDecode = await proColorEngine.decodeSource(asset.uri, 2048);
      return {
        ...processedResult,
        width: nativeDecode.width || processedResult.width,
        height: nativeDecode.height || processedResult.height,
        base64: nativeDecode.previewBase64,
        nativeSourcePath: nativeDecode.nativeSourcePath,
        bitDepthHint:
          nativeDecode.bitDepthHint === 10 ||
          nativeDecode.bitDepthHint === 12 ||
          nativeDecode.bitDepthHint === 14 ||
          nativeDecode.bitDepthHint === 16
            ? nativeDecode.bitDepthHint
            : processedResult.bitDepthHint,
        workingSpaceHint: nativeDecode.workingSpace,
        decodeStrategy: nativeDecode.sourceType === 'raw' ? 'native_raw' : 'native_bitmap',
      };
    } catch (error) {
      console.warn('native source decode failed:', error);
      if (!requiresNativeDecode) {
        return {
          ...processedResult,
          decodeStrategy: 'picker',
        };
      }
      return {
        success: false,
        error: isHeif
          ? 'HEIF 原生解码失败，请更换图片或设备后重试。'
          : 'RAW 原生解码失败，请更换样片或重试。',
      };
    }
  }

  return {
    ...processedResult,
    decodeStrategy: 'picker',
  };
};

const requestStoragePermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    if (Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Permission request error:', err);
    return false;
  }
};

const requestCameraPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.CAMERA,
      {
        title: '相机权限',
        message: '需要使用相机拍摄照片',
        buttonPositive: '允许',
        buttonNegative: '取消',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Camera permission error:', err);
    return false;
  }
};

export const useImagePicker = ({
  onImageSelected,
  onImageError,
  galleryOptions,
  requireNativeDecodeForHeif = true,
}: UseImagePickerOptions = {}) => {
  const [selectedImage, setSelectedImage] = useState<ImagePickerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickFromGallery = useCallback(async (): Promise<ImagePickerResult> => {
    const hasPermission = await requestStoragePermission();
    if (!hasPermission) {
      return {success: false, error: '存储权限被拒绝'};
    }

    setIsLoading(true);
    try {
      const mergedPickerOptions: ExtendedImageLibraryOptions = {
        ...defaultPickerOptions,
        ...(galleryOptions || {}),
      };
      const result = await launchImageLibrary(mergedPickerOptions as ImageLibraryOptions);
      const processedResult = await processImageResult(result, {
        requireNativeDecodeForHeif,
      });

      if (processedResult.success) {
        setSelectedImage(processedResult);
        onImageSelected?.(processedResult);
      } else if (processedResult.error && !result.didCancel) {
        onImageError?.(processedResult.error);
      }

      return processedResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      onImageError?.(errorMsg);
      return {success: false, error: errorMsg};
    } finally {
      setIsLoading(false);
    }
  }, [galleryOptions, onImageError, onImageSelected, requireNativeDecodeForHeif]);

  const pickFromCamera = useCallback(async (): Promise<ImagePickerResult> => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return {success: false, error: '相机权限被拒绝'};
    }

    setIsLoading(true);
    try {
      const result = await launchCamera(cameraOptions);
      const processedResult = await processImageResult(result, {
        requireNativeDecodeForHeif,
      });

      if (processedResult.success) {
        setSelectedImage(processedResult);
        onImageSelected?.(processedResult);
      } else if (processedResult.error && !result.didCancel) {
        onImageError?.(processedResult.error);
      }

      return processedResult;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      onImageError?.(errorMsg);
      return {success: false, error: errorMsg};
    } finally {
      setIsLoading(false);
    }
  }, [onImageError, onImageSelected, requireNativeDecodeForHeif]);

  const clearImage = useCallback(() => {
    setSelectedImage(null);
  }, []);

  return {
    selectedImage,
    isLoading,
    pickFromGallery,
    pickFromCamera,
    clearImage,
  };
};
