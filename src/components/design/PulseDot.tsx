import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View, type ViewStyle} from 'react-native';
import {useAppStore} from '../../store/appStore';
import {MOTION_PRESETS} from '../../theme/motion';
import {VISION_THEME} from '../../theme/visionTheme';

type PulseTone = 'active' | 'warning' | 'idle';

interface PulseDotProps {
  tone?: PulseTone;
  size?: number;
  animated?: boolean;
  style?: ViewStyle;
}

const toneColor = (tone: PulseTone): string => {
  if (tone === 'warning') {
    return VISION_THEME.feedback.warning;
  }
  if (tone === 'idle') {
    return VISION_THEME.text.muted;
  }
  return VISION_THEME.accent.strong;
};

export const PulseDot: React.FC<PulseDotProps> = ({
  tone = 'active',
  size = 8,
  animated = true,
  style,
}) => {
  const motionEnabled = useAppStore(state => state.motionEnabled);
  const alpha = useRef(new Animated.Value(0.5)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const color = toneColor(tone);
  const shouldAnimate = motionEnabled && animated && tone !== 'idle';

  useEffect(() => {
    if (!shouldAnimate) {
      alpha.setValue(0.85);
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(alpha, {
            toValue: 1,
            duration: MOTION_PRESETS.statusPulse.duration,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: MOTION_PRESETS.statusPulse.toScale || 1.08,
            duration: MOTION_PRESETS.statusPulse.duration,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(alpha, {
            toValue: 0.5,
            duration: MOTION_PRESETS.statusPulse.duration,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: MOTION_PRESETS.statusPulse.fromScale || 0.88,
            duration: MOTION_PRESETS.statusPulse.duration,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [alpha, scale, shouldAnimate]);

  return (
    <View style={[styles.wrap, style]}>
      <Animated.View
        style={[
          styles.ring,
          {
            width: size + 6,
            height: size + 6,
            borderRadius: size + 6,
            backgroundColor: color,
            opacity: alpha.interpolate({inputRange: [0, 1], outputRange: [0.06, 0.24]}),
            transform: [{scale}],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: color,
            opacity: alpha,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  dot: {},
});
