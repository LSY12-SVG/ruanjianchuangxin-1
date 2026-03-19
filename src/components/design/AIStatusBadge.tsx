import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import {VISION_THEME} from '../../theme/visionTheme';
import {PulseDot} from './PulseDot';

interface AIStatusBadgeProps {
  label?: string;
  tone?: 'active' | 'warning' | 'idle';
  icon?: string;
  compact?: boolean;
  animated?: boolean;
}

export const AIStatusBadge: React.FC<AIStatusBadgeProps> = ({
  label,
  tone = 'active',
  icon = 'sparkles-outline',
  compact = false,
  animated = false,
}) => {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Icon
        name={icon}
        size={compact ? 11 : 12}
        color={tone === 'warning' ? VISION_THEME.feedback.warning : VISION_THEME.accent.strong}
      />
      <PulseDot tone={tone} size={compact ? 5 : 7} animated={animated} />
      {label ? <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  wrapCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 5,
  },
  label: {
    color: VISION_THEME.text.secondary,
    fontSize: 11,
    fontWeight: '700',
  },
  labelCompact: {
    fontSize: 10,
    fontWeight: '600',
  },
});
