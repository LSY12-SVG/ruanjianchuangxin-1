import React, {memo} from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import type {ColorGradingParams} from '../../types/colorGrading';

interface FilteredImageViewProps {
  uri: string;
  params: ColorGradingParams;
  style?: any;
  isBefore?: boolean;
}

const {width: SCREEN_WIDTH} = Dimensions.get('window');

/**
 * 使用多层叠加的方式模拟调色效果
 * 注意：这是简化实现，真实效果需要原生模块支持
 */
export const FilteredImageView: React.FC<FilteredImageViewProps> = memo(({
  uri,
  params,
  style,
  isBefore = false,
}) => {
  // 如果是"之前"或者没有调整，直接显示原图
  if (isBefore || !hasAdjustments(params)) {
    return (
      <Image
        source={{uri}}
        style={[styles.image, style]}
        resizeMode="contain"
      />
    );
  }

  // 计算叠加层的样式
  const overlayColor = calculateOverlayColor(params);
  const overlayOpacity = calculateOverlayOpacity(params);

  return (
    <View style={styles.container}>
      {/* 底层：原图 */}
      <Image
        source={{uri}}
        style={[styles.image, style]}
        resizeMode="contain"
      />
      
      {/* 叠加层：模拟颜色调整 */}
      {overlayOpacity > 0 && (
        <View
          style={[
            styles.overlay,
            style,
            {
              backgroundColor: overlayColor,
              opacity: overlayOpacity,
            },
          ]}
        />
      )}
      
      {/* 亮度调整层 */}
      {params.basic.brightness !== 0 && (
        <View
          style={[
            styles.brightnessLayer,
            style,
            {
              backgroundColor: params.basic.brightness > 0 ? '#FFFFFF' : '#000000',
              opacity: Math.abs(params.basic.brightness) / 200,
            },
          ]}
        />
      )}
      
      {/* 对比度调整层（简化实现） */}
      {params.basic.contrast !== 0 && (
        <View
          style={[
            styles.contrastLayer,
            style,
            {
              backgroundColor: params.basic.contrast > 0 ? '#000000' : '#808080',
              opacity: Math.abs(params.basic.contrast) / 400,
            },
          ]}
        />
      )}
    </View>
  );
});

function hasAdjustments(params: ColorGradingParams): boolean {
  // 检查是否有任何调整
  const basicValues = Object.values(params.basic);
  const colorBalanceValues = Object.values(params.colorBalance);
  
  return basicValues.some(v => v !== 0) || colorBalanceValues.some(v => v !== 0);
}

function calculateOverlayColor(params: ColorGradingParams): string {
  // 根据色温计算叠加颜色
  const temp = params.colorBalance.temperature;
  
  if (temp > 0) {
    // 暖色调：橙色/黄色
    const intensity = Math.min(Math.abs(temp), 100) / 100;
    return `rgba(255, ${180 - intensity * 80}, ${100 - intensity * 50}, 0.1)`;
  } else if (temp < 0) {
    // 冷色调：蓝色
    const intensity = Math.min(Math.abs(temp), 100) / 100;
    return `rgba(${100 - intensity * 50}, ${150 - intensity * 50}, 255, 0.1)`;
  }
  
  return 'transparent';
}

function calculateOverlayOpacity(params: ColorGradingParams): number {
  let opacity = 0;
  
  // 根据饱和度计算
  if (params.colorBalance.saturation !== 0) {
    opacity += Math.abs(params.colorBalance.saturation) / 200;
  }
  
  // 根据色彩增强计算
  if (params.colorBalance.vibrance !== 0) {
    opacity += Math.abs(params.colorBalance.vibrance) / 200;
  }
  
  return Math.min(opacity, 0.3);
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  brightnessLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  contrastLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
});
