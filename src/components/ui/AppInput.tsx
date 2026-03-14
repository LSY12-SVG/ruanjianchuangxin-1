import React from 'react';
import {StyleSheet} from 'react-native';
import {TextInput} from 'react-native-paper';
import {VISION_THEME} from '../../theme/visionTheme';

interface AppInputProps {
  label?: string;
  value: string;
  placeholder?: string;
  onChangeText: (value: string) => void;
}

export const AppInput: React.FC<AppInputProps> = ({label, value, placeholder, onChangeText}) => {
  return (
    <TextInput
      mode="outlined"
      label={label}
      value={value}
      placeholder={placeholder}
      onChangeText={onChangeText}
      textColor={VISION_THEME.text.primary}
      placeholderTextColor={VISION_THEME.text.muted}
      style={styles.input}
      outlineStyle={styles.outline}
      activeOutlineColor={VISION_THEME.accent.main}
      outlineColor={VISION_THEME.border.soft}
    />
  );
};

const styles = StyleSheet.create({
  input: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  outline: {
    borderRadius: 14,
  },
});
