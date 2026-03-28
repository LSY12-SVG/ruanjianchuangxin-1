import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {floatingShadow} from '../../theme/shadows';
import {radius} from '../../theme/radius';
import {gradients} from '../../theme/tokens';

interface FloatingFABProps {
  onPress: () => void;
  bottom: number;
  right?: number;
}

export const FloatingFAB: React.FC<FloatingFABProps> = ({onPress, bottom, right = 18}) => (
  <Pressable style={[styles.wrap, {bottom, right}]} onPress={onPress}>
    <LinearGradient colors={gradients.assistant} style={styles.button}>
      <Text style={styles.icon}>✦</Text>
    </LinearGradient>
  </Pressable>
);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 20,
    ...floatingShadow,
  },
  button: {
    width: 62,
    height: 62,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
});
