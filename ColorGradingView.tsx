import React from 'react';
import { View, StyleSheet } from 'react-native';
import ImageFilters from 'react-native-gl-image-filters';

export interface ColorGradingViewProps {
  imageUri: string;
  params: {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
  };
  style?: any;
}

export default function ColorGradingView({ imageUri, params, style }: ColorGradingViewProps) {
  return (
    <View style={[styles.container, style]}>
      <ImageFilters
        width={300}
        height={300}
        brightness={params.exposure / 100}
        contrast={1 + params.contrast / 100}
        saturation={1 + params.saturation / 100}
        temperature={params.temperature / 100}
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
