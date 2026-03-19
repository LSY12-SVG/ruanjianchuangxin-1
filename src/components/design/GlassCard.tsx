import React from 'react';
import {StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {VISION_THEME} from '../../theme/visionTheme';

interface GlassCardProps {
  title?: string;
  subtitle?: string;
  subtitleMode?: 'show' | 'weak' | 'hidden';
  accent?: 'default' | 'hero' | 'cta';
  statusNode?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  title,
  subtitle,
  subtitleMode = 'weak',
  accent = 'default',
  statusNode,
  children,
  style,
}) => {
  const borderColors =
    accent === 'hero'
      ? VISION_THEME.gradients.hero
      : accent === 'cta'
        ? VISION_THEME.gradients.cta
        : VISION_THEME.gradients.card;

  return (
    <LinearGradient
      colors={borderColors}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}
      style={[styles.border, style]}>
      <View style={styles.card}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitleMode !== 'hidden' && subtitle ? (
          <Text style={[styles.subtitle, subtitleMode === 'weak' && styles.subtitleWeak]}>{subtitle}</Text>
        ) : null}
        {statusNode || null}
        {children}
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  border: {
    borderRadius: 24,
    padding: 1,
  },
  card: {
    borderRadius: 23,
    backgroundColor: VISION_THEME.surface.card,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    padding: 14,
    gap: 8,
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: VISION_THEME.text.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  subtitleWeak: {
    opacity: 0.72,
    fontSize: 11,
    lineHeight: 16,
  },
});
