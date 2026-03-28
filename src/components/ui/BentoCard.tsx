import React from 'react';
import {StyleSheet, Text, type StyleProp, View, type ViewStyle} from 'react-native';
import {canvasText} from '../../theme/canvasDesign';
import {componentStyles} from '../../theme/components';
import {spacing} from '../../theme/spacing';
import {semanticColors} from '../../theme/tokens';

interface BentoCardProps {
  title: string;
  caption?: string;
  value?: string | number;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const BentoCard: React.FC<BentoCardProps> = ({title, caption, value, icon, children, style}) => (
  <View style={[componentStyles.subtleCard, styles.card, style]}>
    <View style={styles.head}>
      <View style={styles.titleRow}>
        {icon}
        <Text style={styles.title}>{title}</Text>
      </View>
      {value !== undefined ? <Text style={styles.value}>{value}</Text> : null}
    </View>
    {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  title: {
    ...canvasText.bodyStrong,
    color: semanticColors.text.primary,
  },
  value: {
    ...canvasText.sectionTitle,
    color: semanticColors.accent.primary,
  },
  caption: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
  },
});
