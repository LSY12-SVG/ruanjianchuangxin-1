import {Platform, type TextStyle, type ViewStyle} from 'react-native';
import {VISION_THEME} from './visionTheme';
import {componentStyles} from './components';

export const CanvasFonts = {
  display: 'SpaceGrotesk-Variable',
  body: 'Inter-Variable',
};

export const canvasText = {
  heroTitle: {
    fontFamily: CanvasFonts.display,
    fontSize: VISION_THEME.typography.heroTitleSize,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 38,
  } as TextStyle,
  sectionTitle: {
    fontFamily: CanvasFonts.display,
    fontSize: VISION_THEME.typography.sectionTitleSize,
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: 24,
  } as TextStyle,
  body: {
    fontFamily: CanvasFonts.body,
    fontSize: VISION_THEME.typography.bodySize,
    fontWeight: '500',
    lineHeight: 22,
  } as TextStyle,
  bodyStrong: {
    fontFamily: CanvasFonts.body,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  } as TextStyle,
  bodyMuted: {
    fontFamily: CanvasFonts.body,
    fontSize: VISION_THEME.typography.mutedSize,
    fontWeight: '500',
    lineHeight: 18,
  } as TextStyle,
  caption: {
    fontFamily: CanvasFonts.body,
    fontSize: VISION_THEME.typography.captionSize,
    fontWeight: '600',
    lineHeight: 15,
  } as TextStyle,
};

export const glassShadow: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: '#94A3B8',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 10},
  },
  android: {
    elevation: 4,
  },
  default: {},
}) as ViewStyle;

export const cardSurfaceBlue: ViewStyle = {
  ...componentStyles.glassCard,
};

export const cardSurfaceViolet: ViewStyle = {
  ...componentStyles.glassCardStrong,
};

export const cardSurfaceWarm: ViewStyle = {
  ...componentStyles.glassCardStrong,
};

export const canvasUi = {
  input: {
    ...componentStyles.softInput,
  } as ViewStyle,
  chip: {
    ...componentStyles.tag,
  } as ViewStyle,
  chipActive: {
    ...componentStyles.segmentedItemActive,
    borderColor: 'transparent',
  } as ViewStyle,
  primaryButton: {
    ...componentStyles.primaryButton,
  } as ViewStyle,
  secondaryButton: {
    ...componentStyles.secondaryButton,
  } as ViewStyle,
  dangerButton: {
    backgroundColor: VISION_THEME.feedback.danger,
    borderColor: 'transparent',
  } as ViewStyle,
  subtleCard: {
    ...componentStyles.subtleCard,
  } as ViewStyle,
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(203,213,225,0.55)',
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
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(79,70,229,0.1)',
  } as ViewStyle,
};
