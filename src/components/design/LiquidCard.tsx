import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {VISION_THEME} from '../../theme/visionTheme';
import {GlassCard} from './GlassCard';
import {isLiquidGlassSupported} from './liquidSupport';

type LiquidPreset = 'default' | 'frosted' | 'crystal' | 'warm';

interface LiquidCardProps {
  title?: string;
  subtitle?: string;
  subtitleMode?: 'show' | 'weak' | 'hidden';
  statusNode?: React.ReactNode;
  preset?: LiquidPreset;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
  children: React.ReactNode;
}

const presetOverlay = (preset: LiquidPreset): string => {
  if (preset === 'frosted') {
    return 'rgba(255,255,255,0.08)';
  }
  if (preset === 'crystal') {
    return 'rgba(111,231,255,0.12)';
  }
  if (preset === 'warm') {
    return 'rgba(255,197,143,0.14)';
  }
  return 'rgba(255,255,255,0.06)';
};

export const LiquidCard: React.FC<LiquidCardProps> = ({
  title,
  subtitle,
  subtitleMode = 'weak',
  statusNode,
  preset = 'default',
  style,
  enabled,
  children,
}) => {
  const canUseLiquid = enabled ?? isLiquidGlassSupported();

  if (!canUseLiquid) {
    return (
      <GlassCard title={title} subtitle={subtitle} subtitleMode={subtitleMode} statusNode={statusNode} style={style}>
        {children}
      </GlassCard>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.overlay, {backgroundColor: presetOverlay(preset)}]} />
      <View style={styles.inner}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle && subtitleMode !== 'hidden' ? (
          <Text style={[styles.subtitle, subtitleMode === 'weak' && styles.subtitleWeak]}>{subtitle}</Text>
        ) : null}
        {statusNode || null}
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(8,14,24,0.24)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  inner: {
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(8,14,24,0.16)',
    gap: 8,
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: VISION_THEME.text.secondary,
    fontSize: 12,
    lineHeight: 18,
  },
  subtitleWeak: {
    color: VISION_THEME.text.muted,
    fontSize: 11,
    lineHeight: 16,
  },
});
