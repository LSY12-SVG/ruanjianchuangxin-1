import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import type {ImagePickerResult} from '../hooks/useImagePicker';

interface ImagePickerComponentProps {
  selectedImage: ImagePickerResult | null;
  isLoading: boolean;
  onPickFromGallery: () => void;
  onPickFromCamera: () => void;
  onClearImage: () => void;
}

export const ImagePickerComponent: React.FC<ImagePickerComponentProps> = ({
  selectedImage,
  isLoading,
  onPickFromGallery,
  onPickFromCamera,
  onClearImage,
}) => {
  // 如果已选择图片，显示图片和操作按钮
  if (selectedImage?.success && selectedImage.uri) {
    return (
      <View style={styles.imageContainer}>
        <Image
          source={{uri: selectedImage.uri}}
          style={styles.previewImage}
          resizeMode="cover"
        />
        
        {/* 图片信息 */}
        <View style={styles.imageInfo}>
          <Text style={styles.imageSize}>
            {selectedImage.width} × {selectedImage.height}
          </Text>
          {selectedImage.fileSize && (
            <Text style={styles.imageSize}>
              {formatFileSize(selectedImage.fileSize)}
            </Text>
          )}
        </View>

        {/* 操作按钮 */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={onClearImage}
            activeOpacity={0.7}
          >
            <Icon name="trash-outline" size={20} color="#fff" />
            <Text style={styles.clearButtonText}>删除</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.changeButton}
            onPress={onPickFromGallery}
            activeOpacity={0.7}
          >
            <Icon name="images-outline" size={20} color="#6C63FF" />
            <Text style={styles.changeButtonText}>更换</Text>
          </TouchableOpacity>
        </View>

        {/* 加载指示器 */}
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </View>
    );
  }

  // 未选择图片，显示引导界面
  return (
    <View style={styles.emptyContainer}>
      <TouchableOpacity
        style={styles.pickButton}
        onPress={onPickFromGallery}
        disabled={isLoading}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#6C63FF" />
        ) : (
          <>
            <Icon name="images-outline" size={48} color="#6C63FF" />
            <Text style={styles.pickButtonTitle}>选择图片</Text>
            <Text style={styles.pickButtonSubtitle}>
              从相册中选择一张图片开始调色
            </Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>或</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity
        style={styles.cameraButton}
        onPress={onPickFromCamera}
        disabled={isLoading}
        activeOpacity={0.7}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : (
          <>
            <Icon name="camera-outline" size={32} color="#fff" />
            <Text style={styles.cameraButtonText}>拍摄照片</Text>
          </>
        )}
      </TouchableOpacity>

      {isLoading && (
        <View style={styles.loadingTextContainer}>
          <ActivityIndicator size="small" color="#999" />
          <Text style={styles.loadingText}>处理中...</Text>
        </View>
      )}
    </View>
  );
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  imageContainer: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 20,
  },
  imageInfo: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    gap: 12,
  },
  imageSize: {
    fontSize: 12,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionButtons: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  changeButtonText: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  pickButton: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 30,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#6C63FF',
    borderRadius: 20,
    backgroundColor: 'rgba(108, 99, 255, 0.05)',
    width: '100%',
  },
  pickButtonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6C63FF',
    marginTop: 16,
  },
  pickButtonSubtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    width: '100%',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dividerText: {
    fontSize: 14,
    color: '#999',
    marginHorizontal: 16,
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6C63FF',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 10,
  },
  cameraButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingTextContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
  },
});
