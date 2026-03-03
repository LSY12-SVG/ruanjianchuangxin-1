import React, {useEffect, useState, memo} from 'react';
import {
  View,
  Image,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type {ColorGradingParams} from '../../types/colorGrading';
import {processImageWithSkia} from '../../utils/nativeImageProcessor';

interface FilteredImageViewProps {
  uri: string;
  params: ColorGradingParams;
  style?: any;
  isBefore?: boolean;
  quality?: 'draft' | 'standard' | 'high';
  base64Data?: string;
}

/**
 * 使用 Skia 真实处理图片的组件
 */
export const FilteredImageView: React.FC<FilteredImageViewProps> = memo(({
  uri,
  params,
  style,
  isBefore = false,
  quality = 'standard',
  base64Data,
}) => {
  const [processedUri, setProcessedUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 如果是"之前"视图，直接显示原图
    if (isBefore) {
      setProcessedUri(uri);
      setError(null);
      return;
    }

    const processImage = async () => {
      // 如果没有调整参数，直接显示原图
      if (!hasAdjustments(params)) {
        setProcessedUri(uri);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        const processed = await processImageWithSkia(uri, params, base64Data);
        setProcessedUri(processed);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '处理图片失败';
        console.error('Failed to process image:', err);
        setError(errorMsg);
        setProcessedUri(uri); // fallback 到原图
      } finally {
        setLoading(false);
      }
    };

    if (uri) {
      processImage();
    }
  }, [uri, params, isBefore, base64Data]);

  // 显示加载状态
  if (loading) {
    return (
      <View style={[styles.container, style, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  // 显示错误状态
  if (error) {
    return (
      <View style={[styles.container, style, styles.errorContainer]}>
        <Image
          source={{uri}}
          style={styles.image}
          resizeMode="contain"
        />
        <View style={styles.errorOverlay}>
          <View style={styles.errorBadge}>
            <View style={styles.errorIcon} />
          </View>
        </View>
      </View>
    );
  }

  // 显示处理后的图片
  return (
    <View style={styles.container}>
      <Image
        source={{uri: processedUri || uri}}
        style={[styles.image, style]}
        resizeMode="contain"
      />
    </View>
  );
});

/**
 * 检查是否有调整参数
 */
function hasAdjustments(params: ColorGradingParams): boolean {
  const basicValues = Object.values(params.basic);
  const colorBalanceValues = Object.values(params.colorBalance);
  
  return basicValues.some(v => v !== 0) || colorBalanceValues.some(v => v !== 0);
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  errorBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 107, 107, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    width: 16,
    height: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
});
