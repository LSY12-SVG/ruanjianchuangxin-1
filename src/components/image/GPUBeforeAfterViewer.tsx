import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Dimensions,
  PanResponder,
} from 'react-native';
import { Canvas, Image as SkiaImage } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import { GPUColorGradingView } from './GPUColorGradingView';
import type { ColorGradingParams } from '../../types/colorGrading';

interface GPUBeforeAfterViewerProps {
  image: SkImage;
  params: ColorGradingParams;
  showComparison: boolean;
  onToggleComparison: () => void;
}

export const GPUBeforeAfterViewer: React.FC<GPUBeforeAfterViewerProps> = ({
  image,
  params,
  showComparison,
  onToggleComparison,
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);

  // 计算图片显示尺寸（保持宽高比，适应屏幕）
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height * 0.5;

  const imageAspect = image.width() / image.height();
  let displayWidth = screenWidth;
  let displayHeight = screenWidth / imageAspect;

  if (displayHeight > screenHeight) {
    displayHeight = screenHeight;
    displayWidth = screenHeight * imageAspect;
  }

  // 像素宽度（裁剪 & slider 都用 px，避免 % 抖动/错位）
  const afterWidthPx = useMemo(
    () => (displayWidth * sliderPosition) / 100,
    [displayWidth, sliderPosition]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => showComparison,
      onMoveShouldSetPanResponder: () => showComparison,
      onPanResponderMove: (_, gesture) => {
        const newWidthPx = afterWidthPx + gesture.dx;
        const clamped = Math.max(0, Math.min(displayWidth, newWidthPx));
        const percent = (clamped / displayWidth) * 100;
        setSliderPosition(percent);
      },
    })
  ).current;

  return (
    <View style={[styles.container, { width: displayWidth, height: displayHeight }]}>
      {/* 原始图像 */}
      <Canvas style={styles.canvas}>
        <SkiaImage
          image={image}
          x={0}
          y={0}
          width={displayWidth}
          height={displayHeight}
          fit="contain"
        />
      </Canvas>

      {/* 处理后的图像（裁剪遮罩） */}
      {showComparison && (
        <View style={[styles.afterContainer, { width: afterWidthPx }]}>
          <GPUColorGradingView
            image={image}
            params={params}
            displayWidth={displayWidth}
            displayHeight={displayHeight}
          />
        </View>
      )}

      {/* 滑块（可拖动） */}
      {showComparison && (
        <View
          style={[styles.slider, { left: afterWidthPx - 20 }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity onPress={onToggleComparison} activeOpacity={0.85}>
            <View style={styles.sliderButton}>
              <Text style={styles.sliderText}>⟷</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* 切换按钮 */}
      <TouchableOpacity style={styles.toggleButton} onPress={onToggleComparison}>
        <Text style={styles.toggleButtonText}>
          {showComparison ? '隐藏对比' : '显示对比'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    backgroundColor: '#000',
  },
  canvas: {
    flex: 1,
  },
  afterContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    overflow: 'hidden',
    borderRightWidth: 2,
    borderRightColor: '#fff',
  },
  slider: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sliderText: {
    fontSize: 20,
    color: '#333',
  },
  toggleButton: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
  },
  toggleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
