import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Canvas, Image as SkiaImage, ColorMatrix } from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import type { ColorGradingParams } from '../../types/colorGrading';
import {
  createBrightnessMatrix,
  createContrastMatrix,
  createTemperatureMatrix,
  createTintMatrix,
  createSaturationMatrix,
  composeColorMatrices,
} from '../../utils/colorMatrix';

interface GPUColorGradingViewProps {
  image: SkImage;
  params: ColorGradingParams;
  displayWidth: number;
  displayHeight: number;
}

export const GPUColorGradingView: React.FC<GPUColorGradingViewProps> = ({
  image,
  params,
  displayWidth,
  displayHeight,
}) => {
  console.log('GPUColorGradingView - params changed:', {
    brightness: params.basic.brightness,
    contrast: params.basic.contrast,
    temperature: params.colorBalance.temperature,
    tint: params.colorBalance.tint,
    saturation: params.colorBalance.saturation,
  });

  const combinedMatrix = useMemo(() => {
    const matrices: number[][] = [];

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

    if (matrices.length === 0) {
      console.log('GPUColorGradingView - No adjustments, returning null');
      return null;
    }
    
    console.log('GPUColorGradingView - Combined matrix created');
    return composeColorMatrices(matrices);
  }, [params]);

  return (
    <View style={[styles.container, { width: displayWidth, height: displayHeight }]}>
      <Canvas style={styles.canvas}>
        <SkiaImage
          image={image}
          x={0}
          y={0}
          width={displayWidth}
          height={displayHeight}
          fit="contain"
        >
          {combinedMatrix && <ColorMatrix matrix={combinedMatrix} />}
        </SkiaImage>
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
  },
});
