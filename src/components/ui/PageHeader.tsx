import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {canvasText} from '../../theme/canvasDesign';
import {componentStyles} from '../../theme/components';
import {radius} from '../../theme/radius';
import {spacing} from '../../theme/spacing';
import {gradients, semanticColors} from '../../theme/tokens';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({eyebrow, title, subtitle, badge}) => (
  <View style={[componentStyles.glassCardStrong, styles.wrap]}>
    <LinearGradient colors={gradients.hero} style={styles.glow} />
    <View style={styles.content}>
      <View style={styles.topRow}>
        <View style={styles.copy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {badge}
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    ...canvasText.caption,
    color: semanticColors.accent.primary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    ...canvasText.heroTitle,
    color: semanticColors.text.primary,
  },
  subtitle: {
    ...canvasText.body,
    color: semanticColors.text.secondary,
    maxWidth: 320,
  },
});
