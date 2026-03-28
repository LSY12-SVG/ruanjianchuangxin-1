import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {canvasText} from '../../theme/canvasDesign';
import {componentStyles} from '../../theme/components';
import {gradients, semanticColors} from '../../theme/tokens';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  testID?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  onPress,
  icon,
  loading = false,
  disabled = false,
  variant = 'primary',
  testID,
}) => {
  const content = (
    <View style={styles.inner}>
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#FFFFFF' : semanticColors.text.primary} />
      ) : (
        icon
      )}
      <Text style={[styles.label, variant === 'secondary' && styles.labelSecondary]}>{label}</Text>
    </View>
  );

  if (variant === 'secondary') {
    return (
      <Pressable
        testID={testID}
        style={[styles.base, componentStyles.secondaryButton, disabled && styles.disabled]}
        onPress={onPress}
        disabled={disabled || loading}>
        {content}
      </Pressable>
    );
  }

  return (
    <Pressable
      testID={testID}
      style={[styles.base, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled || loading}>
      <LinearGradient colors={gradients.primary} style={[styles.gradient, componentStyles.primaryButton]}>
        {content}
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
  gradient: {
    justifyContent: 'center',
  },
  inner: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  label: {
    ...canvasText.bodyStrong,
    color: '#FFFFFF',
  },
  labelSecondary: {
    color: semanticColors.text.primary,
  },
  disabled: {
    opacity: 0.58,
  },
});
