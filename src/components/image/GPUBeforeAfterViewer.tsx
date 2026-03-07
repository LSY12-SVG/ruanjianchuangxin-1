import React, {useMemo, useRef, useState} from 'react';
import {
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Canvas, Image as SkiaImage} from '@shopify/react-native-skia';
import type {SkImage} from '@shopify/react-native-skia';
import {GPUColorGradingView} from './GPUColorGradingView';
import type {ColorGradingParams} from '../../types/colorGrading.ts';

interface GPUBeforeAfterViewerProps {
  image: SkImage;
  params: ColorGradingParams;
  showComparison: boolean;
  onToggleComparison: () => void;
  onShaderAvailabilityChange?: (available: boolean) => void;
}

export const GPUBeforeAfterViewer: React.FC<GPUBeforeAfterViewerProps> = ({
  image,
  params,
  showComparison,
  onToggleComparison,
  onShaderAvailabilityChange,
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const dragStartPx = useRef(0);

  const screenWidth = Dimensions.get('window').width - 32;
  const maxHeight = Dimensions.get('window').height * 0.46;

  const imageAspect = image.width() / image.height();
  let displayWidth = screenWidth;
  let displayHeight = screenWidth / imageAspect;

  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = maxHeight * imageAspect;
  }

  const afterWidthPx = useMemo(
    () => (displayWidth * sliderPosition) / 100,
    [displayWidth, sliderPosition],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => showComparison,
      onMoveShouldSetPanResponder: () => showComparison,
      onPanResponderGrant: () => {
        dragStartPx.current = afterWidthPx;
      },
      onPanResponderMove: (_, gesture) => {
        const movedPx = dragStartPx.current + gesture.dx;
        const clamped = Math.max(0, Math.min(displayWidth, movedPx));
        setSliderPosition((clamped / displayWidth) * 100);
      },
    }),
  ).current;

  return (
    <View style={[styles.container, {width: displayWidth, height: displayHeight}]}> 
      {!showComparison ? (
        <GPUColorGradingView
          image={image}
          params={params}
          displayWidth={displayWidth}
          displayHeight={displayHeight}
          onShaderAvailabilityChange={onShaderAvailabilityChange}
        />
      ) : (
        <>
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

          <View style={[styles.afterContainer, {width: afterWidthPx}]}> 
            <GPUColorGradingView
              image={image}
              params={params}
              displayWidth={displayWidth}
              displayHeight={displayHeight}
              onShaderAvailabilityChange={onShaderAvailabilityChange}
            />
          </View>

          <View
            style={[styles.slider, {left: afterWidthPx - 18}]}
            {...panResponder.panHandlers}>
            <Text style={styles.sliderText}>||</Text>
          </View>
        </>
      )}

      <TouchableOpacity style={styles.toggleButton} onPress={onToggleComparison}>
        <Text style={styles.toggleButtonText}>{showComparison ? '对比预览' : '仅看调色结果'}</Text>
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
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
    borderRightWidth: 2,
    borderRightColor: '#f0f7ff',
  },
  slider: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,247,255,0.95)',
  },
  sliderText: {
    color: '#0d3a65',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  toggleButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(7,32,56,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toggleButtonText: {
    color: '#e8f3ff',
    fontSize: 12,
    fontWeight: '600',
  },
});
