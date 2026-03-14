import React from 'react';
import {StyleSheet} from 'react-native';
import {Button} from 'react-native-paper';
import {VISION_THEME} from '../../theme/visionTheme';

interface AppButtonProps {
  label: string;
  icon?: string;
  mode?: 'text' | 'outlined' | 'contained';
  onPress?: () => void;
  disabled?: boolean;
  style?: object;
}

export const AppButton: React.FC<AppButtonProps> = ({
  label,
  icon,
  mode = 'contained',
  onPress,
  disabled,
  style,
}) => {
  return (
    <Button
      mode={mode}
      icon={icon}
      onPress={onPress}
      disabled={disabled}
      contentStyle={styles.content}
      labelStyle={styles.label}
      style={[styles.button, mode === 'outlined' ? styles.outlined : null, style]}
      buttonColor={mode === 'contained' ? VISION_THEME.accent.main : undefined}
      textColor={mode === 'contained' ? VISION_THEME.accent.dark : VISION_THEME.text.secondary}>
      {label}
    </Button>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 14,
  },
  outlined: {
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  content: {
    minHeight: 42,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
});
