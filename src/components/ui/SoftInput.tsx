import React, {useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import {canvasText} from '../../theme/canvasDesign';
import {componentStyles} from '../../theme/components';
import {radius} from '../../theme/radius';
import {spacing} from '../../theme/spacing';
import {semanticColors} from '../../theme/tokens';

interface SoftInputProps extends TextInputProps {
  label?: string;
  leftIcon?: React.ReactNode;
  rightAction?: React.ReactNode;
  helper?: string;
  error?: string;
}

export const SoftInput: React.FC<SoftInputProps> = ({
  label,
  leftIcon,
  rightAction,
  helper,
  error,
  multiline,
  style,
  ...props
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.inputWrap,
          componentStyles.softInput,
          focused && componentStyles.softInputFocused,
          multiline && styles.multilineWrap,
        ]}>
        {leftIcon ? <View style={styles.iconSlot}>{leftIcon}</View> : null}
        <TextInput
          {...props}
          multiline={multiline}
          style={[styles.input, multiline && styles.multiline, style]}
          placeholderTextColor={semanticColors.text.tertiary}
          onFocus={event => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            props.onBlur?.(event);
          }}
        />
        {rightAction ? <Pressable style={styles.iconSlot}>{rightAction}</Pressable> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  label: {
    ...canvasText.bodyStrong,
    color: semanticColors.text.primary,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  multilineWrap: {
    minHeight: 120,
    alignItems: 'flex-start',
    paddingTop: spacing.md,
  },
  iconSlot: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  input: {
    ...canvasText.body,
    flex: 1,
    minHeight: 56,
    color: semanticColors.text.primary,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  helper: {
    ...canvasText.bodyMuted,
    color: semanticColors.text.secondary,
  },
  error: {
    ...canvasText.bodyMuted,
    color: semanticColors.feedback.danger,
  },
});
