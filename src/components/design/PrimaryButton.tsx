import React, {useRef} from 'react';
import {Animated, Pressable, StyleSheet, Text, View, type ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import {useAppStore} from '../../store/appStore';
import {VISION_THEME} from '../../theme/visionTheme';

interface PrimaryButtonProps {
  label?: string;
  icon?: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  labelMode?: 'normal' | 'weak' | 'hidden';
  focusPulse?: boolean;
  style?: ViewStyle;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  label,
  icon,
  onPress,
  disabled = false,
  variant = 'primary',
  labelMode = 'normal',
  focusPulse = false,
  style,
}) => {
  const motionEnabled = useAppStore(state => state.motionEnabled);
  const scale = useRef(new Animated.Value(1)).current;
  const glow = motionEnabled && focusPulse && variant === 'primary' && !disabled ? 0.2 : 0.08;

  const animateTo = (value: number) => {
    Animated.timing(scale, {
      toValue: value,
      duration: VISION_THEME.motion.quick,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[styles.wrap, {transform: [{scale}]}, style]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={({pressed}) => [styles.buttonBase, pressed && styles.pressed, disabled && styles.disabled]}>
        {variant === 'primary' ? (
          <LinearGradient
            colors={VISION_THEME.gradients.cta}
            start={{x: 0, y: 0}}
            end={{x: 1, y: 1}}
            style={styles.gradient}>
            <Animated.View style={[styles.glow, {opacity: glow}]} />
            <View style={styles.content}>
              {icon ? <Icon name={icon} size={16} color="#EFF6FF" /> : null}
              {labelMode !== 'hidden' && label ? (
                <Text style={[styles.primaryText, labelMode === 'weak' && styles.weakText]}>{label}</Text>
              ) : null}
            </View>
          </LinearGradient>
        ) : (
          <View style={styles.secondary}>
            <View style={styles.content}>
              {icon ? <Icon name={icon} size={16} color={VISION_THEME.text.secondary} /> : null}
              {labelMode !== 'hidden' && label ? (
                <Text style={[styles.secondaryText, labelMode === 'weak' && styles.weakText]}>{label}</Text>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 22,
  },
  buttonBase: {
    borderRadius: 22,
    overflow: 'hidden',
    minHeight: 54,
  },
  pressed: {
    opacity: 0.95,
  },
  disabled: {
    opacity: 0.45,
  },
  gradient: {
    minHeight: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#4DA3FF',
    shadowOpacity: 0.32,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 6},
    elevation: 8,
  },
  secondary: {
    minHeight: 54,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#EAF4FF',
  },
  primaryText: {
    color: '#EFF6FF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryText: {
    color: VISION_THEME.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  weakText: {
    opacity: 0.82,
    fontSize: 14,
  },
});
