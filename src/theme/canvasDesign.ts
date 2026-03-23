import {Platform, type TextStyle, type ViewStyle} from 'react-native';
import {VISION_THEME} from './visionTheme';

export const CanvasFonts = {
  display: 'SpaceGrotesk-Variable',
  body: 'Inter-Variable',
};

export const canvasText = {
  heroTitle: {
    fontFamily: CanvasFonts.display,
    fontSize: VISION_THEME.typography.heroTitleSize,
    fontWeight: '700',
    letterSpacing: -0.4,
  } as TextStyle,
  sectionTitle: {
    fontFamily: CanvasFonts.display,
    fontSize: VISION_THEME.typography.sectionTitleSize,
    fontWeight: '700',
    letterSpacing: -0.2,
  } as TextStyle,
  body: {
    fontFamily: CanvasFonts.body,
    fontSize: VISION_THEME.typography.bodySize,
    fontWeight: '500',
  } as TextStyle,
  bodyStrong: {
    fontFamily: CanvasFonts.body,
    fontSize: 12,
    fontWeight: '700',
  } as TextStyle,
  bodyMuted: {
    fontFamily: CanvasFonts.body,
    fontSize: VISION_THEME.typography.mutedSize,
    fontWeight: '500',
  } as TextStyle,
  caption: {
    fontFamily: CanvasFonts.body,
    fontSize: VISION_THEME.typography.captionSize,
    fontWeight: '600',
  } as TextStyle,
};

export const glassShadow: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: '#5A4032',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
  },
  android: {
    elevation: 4,
  },
  default: {},
}) as ViewStyle;

export const cardSurfaceBlue: ViewStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: VISION_THEME.border.soft,
  backgroundColor: VISION_THEME.surface.card,
};

export const cardSurfaceViolet: ViewStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: VISION_THEME.border.soft,
  backgroundColor: VISION_THEME.surface.elevated,
};

export const cardSurfaceWarm: ViewStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: VISION_THEME.border.soft,
  backgroundColor: VISION_THEME.surface.elevated,
};

export const canvasUi = {
  input: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: VISION_THEME.surface.input,
  } as ViewStyle,
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: VISION_THEME.surface.chip,
  } as ViewStyle,
  chipActive: {
    backgroundColor: VISION_THEME.surface.active,
    borderColor: VISION_THEME.border.focus,
  } as ViewStyle,
  primaryButton: {
    borderRadius: 13,
    backgroundColor: VISION_THEME.accent.main,
    borderWidth: 1,
    borderColor: 'rgba(190,107,91,0.75)',
  } as ViewStyle,
  secondaryButton: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: VISION_THEME.border.soft,
    backgroundColor: VISION_THEME.surface.input,
  } as ViewStyle,
  dangerButton: {
    backgroundColor: VISION_THEME.feedback.danger,
    borderColor: 'rgba(216,120,128,0.7)',
  } as ViewStyle,
  subtleCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(171,129,110,0.24)',
    backgroundColor: VISION_THEME.surface.subtleCard,
  } as ViewStyle,
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(171,129,110,0.2)',
    overflow: 'hidden',
  } as ViewStyle,
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: VISION_THEME.accent.main,
  } as ViewStyle,
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  } as ViewStyle,
  iconBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(163,74,60,0.18)',
  } as ViewStyle,
};
