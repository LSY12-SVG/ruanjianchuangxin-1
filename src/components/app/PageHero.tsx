import React from 'react';
import {
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {canvasText} from '../../theme/canvasDesign';
import {radius} from '../../theme/radius';
import {spacing} from '../../theme/spacing';
import {semanticColors} from '../../theme/tokens';

interface PageHeroProps {
  image: ImageSourcePropType;
  title: string;
  subtitle: string;
  overlayColors?: [string, string, string];
  variant?: 'warm' | 'editorial' | 'contrast';
  overlayStrength?: 'soft' | 'normal' | 'strong';
  height?: number;
}

const resolveHeroColors = (
  variant: PageHeroProps['variant'],
  overlayColors?: [string, string, string],
): [string, string, string] => {
  if (overlayColors) {
    return overlayColors;
  }

  if (variant === 'contrast') {
    return ['#DCE8FF', '#E8EFFF', '#E0F2FE'];
  }

  if (variant === 'editorial') {
    return ['#F6F9FF', '#EAF0FF', '#ECFEFF'];
  }

  return ['#F8FBFF', '#EEF2FF', '#E0F2FE'];
};

export const PageHero: React.FC<PageHeroProps> = ({
  title,
  subtitle,
  overlayColors,
  variant = 'warm',
  overlayStrength = 'normal',
  height = 136,
}) => {
  const colors = resolveHeroColors(variant, overlayColors);
  const accentOpacity =
    overlayStrength === 'soft' ? 0.42 : overlayStrength === 'strong' ? 0.8 : 0.6;

  return (
    <View style={[styles.hero, {height}]}>
      <LinearGradient colors={colors} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.blurOrb, styles.blurOrbTop, {opacity: accentOpacity}]} />
      <View style={[styles.blurOrb, styles.blurOrbBottom, {opacity: accentOpacity * 0.8}]} />
      <View style={[styles.blurOrb, styles.blurOrbSide, {opacity: accentOpacity * 0.72}]} />
      <View style={styles.gridOverlay}>
        <View style={[styles.gridLine, styles.gridLineVertical]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal]} />
      </View>
      <View style={styles.topAccent} />
      <View style={styles.copyWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.95)',
    backgroundColor: 'rgba(245,248,255,0.92)',
    shadowColor: '#C7D2FE',
    shadowOpacity: 0.26,
    shadowRadius: 22,
    shadowOffset: {width: 0, height: 14},
  },
  copyWrap: {
    position: 'relative',
    zIndex: 2,
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    gap: 6,
  },
  title: {
    ...canvasText.heroTitle,
    color: semanticColors.text.primary,
    fontSize: 32,
    lineHeight: 36,
  },
  subtitle: {
    ...canvasText.body,
    color: semanticColors.text.secondary,
    maxWidth: 340,
    lineHeight: 24,
    fontSize: 16,
  },
  topAccent: {
    position: 'absolute',
    top: 18,
    right: 22,
    width: 92,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(79,70,229,0.62)',
  },
  blurOrb: {
    position: 'absolute',
    borderRadius: radius.pill,
  },
  blurOrbTop: {
    width: 190,
    height: 190,
    top: -42,
    right: -20,
    backgroundColor: 'rgba(99,102,241,0.3)',
  },
  blurOrbBottom: {
    width: 210,
    height: 210,
    bottom: -86,
    left: -28,
    backgroundColor: 'rgba(56,189,248,0.24)',
  },
  blurOrbSide: {
    width: 160,
    height: 160,
    top: 12,
    right: 120,
    backgroundColor: 'rgba(139,92,246,0.18)',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(148,163,184,0.24)',
  },
  gridLineVertical: {
    top: 28,
    bottom: -10,
    right: 148,
    width: 1,
  },
  gridLineHorizontal: {
    left: '56%',
    right: -10,
    top: 86,
    height: 1,
  },
});
