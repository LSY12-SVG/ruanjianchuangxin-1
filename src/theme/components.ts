import {type TextStyle, type ViewStyle} from 'react-native';
import {glassPalette, semanticColors} from './tokens';
import {radius} from './radius';
import {softShadow} from './shadows';

export const componentStyles = {
  glassCard: {
    ...softShadow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    backgroundColor: glassPalette.card,
  } as ViewStyle,
  glassCardStrong: {
    ...softShadow,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: semanticColors.border.strong,
    backgroundColor: glassPalette.cardStrong,
  } as ViewStyle,
  subtleCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semanticColors.border.strong,
    backgroundColor: glassPalette.cardMuted,
  } as ViewStyle,
  segmentedRail: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    backgroundColor: glassPalette.input,
  } as ViewStyle,
  segmentedItemActive: {
    borderRadius: radius.pill,
    backgroundColor: glassPalette.cardStrong,
  } as ViewStyle,
  softInput: {
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: glassPalette.input,
  } as ViewStyle,
  softInputFocused: {
    borderColor: semanticColors.border.focus,
    backgroundColor: glassPalette.inputFocused,
  } as ViewStyle,
  primaryButton: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: semanticColors.accent.primary,
  } as ViewStyle,
  secondaryButton: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    backgroundColor: glassPalette.cardStrong,
  } as ViewStyle,
  tag: {
    borderRadius: radius.pill,
    backgroundColor: glassPalette.input,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
  } as ViewStyle,
  listRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: semanticColors.border.subtle,
    backgroundColor: glassPalette.cardStrong,
  } as ViewStyle,
};

export const componentText = {
  primaryButton: {
    color: semanticColors.text.inverse,
    fontWeight: '700',
  } as TextStyle,
  secondaryButton: {
    color: semanticColors.text.primary,
    fontWeight: '700',
  } as TextStyle,
};
