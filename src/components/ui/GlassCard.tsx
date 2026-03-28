import React from 'react';
import {StyleSheet, type StyleProp, View, type ViewStyle} from 'react-native';
import {componentStyles} from '../../theme/components';
import {spacing} from '../../theme/spacing';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  strong?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  contentStyle,
  strong = false,
}) => (
  <View style={[strong ? componentStyles.glassCardStrong : componentStyles.glassCard, style]}>
    <View style={[styles.content, contentStyle]}>{children}</View>
  </View>
);

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    padding: spacing.lg,
  },
});
