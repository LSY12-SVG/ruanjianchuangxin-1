import {useState, useCallback} from 'react';
import {launchCamera, launchImageLibrary, type ImageLibraryOptions, type CameraOptions} from 'react-native-image-picker';

export interface ImagePickerResult {
  success: boolean;
  uri?: string;
  width?: number;
  height?: number;
  fileName?: string;
  fileSize?: number;
  type?: string;
  error?: string;
}

interface UseImagePickerOptions {
  onImageSelected?: (result: ImagePickerResult) => void;
  onImageError?: (error: string) => void;
}

export const useImagePicker = ({
  onImageSelected,
  onImageError,
}: UseImagePickerOptions = {}) => {
  const [selectedImage, setSelectedImage] = useState<ImagePickerResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const pickerOptions: ImageLibraryOptions = {
    mediaType: 'photo',
    quality: 1,
    maxWidth: 2048,
    maxHeight: 2048,
    includeBase64: false,
    selectionLimit: 1,
  };

  const cameraOptions: CameraOptions = {
    mediaType: 'photo',
    quality: 1,
    maxWidth: 2048,
    maxHeight: 2048,
    includeBase64: false,
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
    };
  };

  const pickFromGallery = useCallback(async (): Promise<ImagePickerResult> => {
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
  }, [onImageSelected, onImageError]);

  const pickFromCamera = useCallback(async (): Promise<ImagePickerResult> => {
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
  }, [onImageSelected, onImageError]);

  const clearImage = useCallback(() => {
    setSelectedImage(null);
  }, []);

  const setImage = useCallback((result: ImagePickerResult) => {
    setSelectedImage(result);
    if (result.success) {
      onImageSelected?.(result);
    }
  }, [onImageSelected]);

  return {
    selectedImage,
    isLoading,
    pickFromGallery,
    pickFromCamera,
    clearImage,
    setImage,
  };
};
