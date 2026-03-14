import React from 'react';
import {StyleSheet} from 'react-native';
import {Surface, Text} from 'react-native-paper';
import {VISION_THEME} from '../../theme/visionTheme';

interface AppCardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  style?: object;
}

export const AppCard: React.FC<AppCardProps> = ({title, subtitle, children, style}) => {
  return (
    <Surface style={[styles.card, style]} elevation={3}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </Surface>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: VISION_THEME.surface.card,
    padding: 12,
    gap: 8,
  },
  title: {
    color: VISION_THEME.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: VISION_THEME.text.muted,
    fontSize: 12,
  },
});
