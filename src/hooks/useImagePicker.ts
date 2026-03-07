import {useState, useCallback} from 'react';
import {Platform, PermissionsAndroid} from 'react-native';
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
  error?: string;
}

interface UseImagePickerOptions {
  onImageSelected?: (result: ImagePickerResult) => void;
  onImageError?: (error: string) => void;
}

const pickerOptions: ImageLibraryOptions = {
  mediaType: 'photo',
  quality: 1,
  maxWidth: 2048,
  maxHeight: 2048,
  includeBase64: true,
  selectionLimit: 1,
};

const cameraOptions: CameraOptions = {
  mediaType: 'photo',
  quality: 1,
  maxWidth: 2048,
  maxHeight: 2048,
  includeBase64: true,
  cameraType: 'back',
  saveToPhotos: true,
};

const processImageResult = (result: any): ImagePickerResult => {
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

  return {
    success: true,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    type: asset.type,
    base64: asset.base64,
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
      const result = await launchImageLibrary(pickerOptions);
      const processedResult = processImageResult(result);

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
  }, [onImageError, onImageSelected]);

  const pickFromCamera = useCallback(async (): Promise<ImagePickerResult> => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      return {success: false, error: '相机权限被拒绝'};
    }

    setIsLoading(true);
    try {
      const result = await launchCamera(cameraOptions);
      const processedResult = processImageResult(result);

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
  }, [onImageError, onImageSelected]);

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
