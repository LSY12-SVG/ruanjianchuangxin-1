import React from 'react';
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Canvas, Image as SkiaImage} from '@shopify/react-native-skia';
import type {SkImage} from '@shopify/react-native-skia';
import {GPUColorGradingView} from './GPUColorGradingView';
import type {ColorGradingParams} from '../../types/colorGrading.ts';
import type {
  HslSecondaryAdjustments,
  Lut3D,
  LutSlot,
  LocalMaskLayer,
  ResolvedColorEngineMode,
} from '../../types/colorEngine';

interface GPUBeforeAfterViewerProps {
  image: SkImage;
  params: ColorGradingParams;
  showComparison: boolean;
  onToggleComparison: () => void;
  onShaderAvailabilityChange?: (available: boolean) => void;
  engineMode?: ResolvedColorEngineMode;
  localMasks?: LocalMaskLayer[];
  hsl?: HslSecondaryAdjustments;
  lut?: LutSlot | null;
  lutLibrary?: Record<string, Lut3D>;
}

export const GPUBeforeAfterViewer: React.FC<GPUBeforeAfterViewerProps> = ({
  image,
  params,
  showComparison,
  onToggleComparison,
  onShaderAvailabilityChange,
  engineMode,
  localMasks,
  hsl,
  lut,
  lutLibrary,
}) => {
  const screenWidth = Dimensions.get('window').width - 32;
  const maxHeight = Dimensions.get('window').height * 0.46;

  const imageAspect = image.width() / image.height();
  const comparePaneWidth = (screenWidth - 1) / 2;

  let singleDisplayWidth = screenWidth;
  let singleDisplayHeight = screenWidth / imageAspect;

  if (singleDisplayHeight > maxHeight) {
    singleDisplayHeight = maxHeight;
    singleDisplayWidth = maxHeight * imageAspect;
  }

  let compareDisplayHeight = comparePaneWidth / imageAspect;
  if (compareDisplayHeight > maxHeight) {
    compareDisplayHeight = maxHeight;
  }
  const displayWidth = showComparison ? screenWidth : singleDisplayWidth;
  const displayHeight = showComparison ? compareDisplayHeight : singleDisplayHeight;

  return (
    <View style={[styles.container, {width: displayWidth, height: displayHeight}]}>
      {!showComparison ? (
        <GPUColorGradingView
          image={image}
          params={params}
          displayWidth={displayWidth}
          displayHeight={displayHeight}
          onShaderAvailabilityChange={onShaderAvailabilityChange}
          engineMode={engineMode}
          localMasks={localMasks}
          hsl={hsl}
          lut={lut}
          lutLibrary={lutLibrary}
        />
      ) : (
        <View style={styles.compareRow}>
          <View style={[styles.comparePane, {width: comparePaneWidth, height: displayHeight}]}>
            <Canvas style={styles.canvas}>
              <SkiaImage
                image={image}
                x={0}
                y={0}
                width={comparePaneWidth}
                height={displayHeight}
                fit="contain"
              />
            </Canvas>
            <View style={styles.compareTag}>
              <Text style={styles.compareTagText}>原图</Text>
            </View>
          </View>

          <View style={styles.compareDivider} />

          <View style={[styles.comparePane, {width: comparePaneWidth, height: displayHeight}]}>
            <GPUColorGradingView
              image={image}
              params={params}
              displayWidth={comparePaneWidth}
              displayHeight={displayHeight}
              onShaderAvailabilityChange={onShaderAvailabilityChange}
              engineMode={engineMode}
              localMasks={localMasks}
              hsl={hsl}
              lut={lut}
              lutLibrary={lutLibrary}
            />
            <View style={styles.compareTag}>
              <Text style={styles.compareTagText}>调色后</Text>
            </View>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.toggleButton} onPress={onToggleComparison}>
        <Text style={styles.toggleButtonText}>{showComparison ? '仅看调色结果' : '左右对比'}</Text>
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
  compareRow: {
    flex: 1,
    flexDirection: 'row',
  },
  comparePane: {
    height: '100%',
    overflow: 'hidden',
  },
  compareDivider: {
    width: 1,
    backgroundColor: 'rgba(240,247,255,0.8)',
  },
  compareTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(10, 20, 38, 0.72)',
  },
  compareTagText: {
    color: '#e8f3ff',
    fontSize: 11,
    fontWeight: '700',
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
