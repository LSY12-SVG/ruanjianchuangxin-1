import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {isLiquidGlassSupported} from './liquidSupport';

interface LiquidFloatingBarProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
}

export const LiquidFloatingBar: React.FC<LiquidFloatingBarProps> = ({
  children,
  style,
  enabled,
}) => {
  const canUseLiquid = enabled ?? isLiquidGlassSupported();
  if (!canUseLiquid) {
    return <View style={[styles.fallback, style]}>{children}</View>;
  }
  return (
    <View style={[styles.container, style]}>
      <View style={styles.overlay} />
      <View style={styles.inner}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(111,231,255,0.26)',
    backgroundColor: 'rgba(8,14,24,0.2)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(111,231,255,0.1)',
  },
  inner: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(8,14,24,0.1)',
  },
  fallback: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
