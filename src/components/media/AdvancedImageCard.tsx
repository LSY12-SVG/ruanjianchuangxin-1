import React from 'react';
import {StyleSheet, View, ViewStyle} from 'react-native';
import {Canvas, LinearGradient, Rect, vec} from '@shopify/react-native-skia';
import FastImage, {type Source} from 'react-native-fast-image';
import {Text} from 'react-native-paper';
import type {ImageFxPreset} from '../../types/media';
import {VISION_THEME} from '../../theme/visionTheme';

interface AdvancedImageCardProps {
  source?: Source;
  label?: string;
  preset?: ImageFxPreset;
  style?: ViewStyle;
  imageStyle?: object;
}

const presetOverlay = (preset: ImageFxPreset): [string, string] => {
  if (preset === 'vivid') {
    return ['rgba(255, 122, 69, 0.35)', 'rgba(111, 21, 55, 0.2)'];
  }
  if (preset === 'editorial') {
    return ['rgba(255, 176, 137, 0.25)', 'rgba(61, 10, 31, 0.28)'];
  }
  if (preset === 'clean') {
    return ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.04)'];
  }
  return ['rgba(255, 122, 69, 0.24)', 'rgba(61, 10, 31, 0.32)'];
};

export const AdvancedImageCard: React.FC<AdvancedImageCardProps> = ({
  source,
  label,
  preset = 'cinematic',
  style,
  imageStyle,
}) => {
  const [topColor, bottomColor] = presetOverlay(preset);

  return (
    <View style={[styles.container, style]}>
      {source?.uri ? (
        <FastImage
          source={source}
          resizeMode={FastImage.resizeMode.cover}
          style={[styles.image, imageStyle]}
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>{label || 'Image'}</Text>
        </View>
      )}

      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect x={0} y={0} width={1200} height={1200}>
          <LinearGradient start={vec(0, 0)} end={vec(1200, 1200)} colors={[topColor, bottomColor]} />
        </Rect>
      </Canvas>

      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    minHeight: 92,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: 92,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 92,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  placeholderText: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    fontSize: 11,
    color: VISION_THEME.text.primary,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.35)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
