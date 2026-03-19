import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {isLiquidGlassSupported} from './liquidSupport';

type PanelPreset = 'default' | 'frosted' | 'warm';

interface LiquidPanelProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  preset?: PanelPreset;
  enabled?: boolean;
}

const panelOverlay = (preset: PanelPreset): string => {
  if (preset === 'frosted') {
    return 'rgba(255,255,255,0.08)';
  }
  if (preset === 'warm') {
    return 'rgba(255,197,143,0.12)';
  }
  return 'rgba(255,255,255,0.06)';
};

export const LiquidPanel: React.FC<LiquidPanelProps> = ({
  children,
  style,
  preset = 'default',
  enabled,
}) => {
  const canUseLiquid = enabled ?? isLiquidGlassSupported();
  if (!canUseLiquid) {
    return <View style={style}>{children}</View>;
  }
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.overlay, {backgroundColor: panelOverlay(preset)}]} />
      <View style={styles.inner}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(8,14,24,0.2)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  inner: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(8,14,24,0.12)',
  },
});
