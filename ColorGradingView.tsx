import React from 'react';
import { View, StyleSheet } from 'react-native';
import ImageFilters from 'react-native-gl-image-filters';
import { ColorProfile } from './ColorProfile';
import ColorGradingEngine from './ColorGradingEngine';

export interface ColorGradingViewProps {
  imageUri: string;
  profile: ColorProfile;
  style?: any;
}

export default function ColorGradingView({ imageUri, profile, style }: ColorGradingViewProps) {
  const engine = ColorGradingEngine.getInstance();
  const filterParams = engine.convertProfileToImageFilters(profile);

  return (
    <View style={[styles.container, style]}>
      <ImageFilters
        width={300}
        height={300}
        brightness={filterParams.brightness}
        contrast={filterParams.contrast}
        saturation={filterParams.saturation}
        hue={filterParams.hue}
        temperature={filterParams.temperature}
        sepia={filterParams.sepia}
        sharpen={filterParams.sharpen}
        blur={filterParams.blur}
      >
        {{ uri: imageUri }}
      </ImageFilters>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
