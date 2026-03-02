import React from 'react';
import { View, StyleSheet } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface ColorOverlayProps {
  params: any;
  style?: any;
  children: React.ReactNode;
}

export default function ColorOverlay({ params, style, children }: ColorOverlayProps) {
  const overlayColor = getOverlayColor(params);
  
  if (!overlayColor) {
    return <View style={style}>{children}</View>;
  }

  return (
    <View style={[styles.container, style]}>
      {children}
      <LinearGradient
        colors={[overlayColor, 'transparent']}
        style={styles.overlay}
        pointerEvents="none"
      />
    </View>
  );
}

function getOverlayColor(params: any): string | null {
  if (params.temperature && params.temperature > 1.1) {
    return 'rgba(255, 200, 150, 0.15)';
  }
  
  if (params.temperature && params.temperature < 0.9) {
    return 'rgba(150, 200, 255, 0.15)';
  }
  
  if (params.tint && params.tint > 1.1) {
    return 'rgba(150, 255, 150, 0.1)';
  }
  
  if (params.hue && params.hue > 1.1) {
    return 'rgba(200, 150, 255, 0.1)';
  }
  
  return null;
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
