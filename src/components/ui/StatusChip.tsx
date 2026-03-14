import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {VISION_THEME} from '../../theme/visionTheme';

interface StatusChipProps {
  label: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
}

const toneColor = {
  info: VISION_THEME.accent.main,
  success: VISION_THEME.feedback.success,
  warning: VISION_THEME.feedback.warning,
  danger: VISION_THEME.feedback.danger,
} as const;

export const StatusChip: React.FC<StatusChipProps> = ({label, tone = 'info'}) => {
  const color = toneColor[tone];
  return (
    <View style={[styles.container, {borderColor: `${color}66`, backgroundColor: `${color}1F`}]}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <Text style={[styles.text, {color}]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
