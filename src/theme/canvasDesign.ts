import {Platform, type TextStyle, type ViewStyle} from 'react-native';

export const CanvasFonts = {
  display: 'SpaceGrotesk-Variable',
  body: 'Inter-Variable',
};

export const canvasText = {
  heroTitle: {
    fontFamily: CanvasFonts.display,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  } as TextStyle,
  sectionTitle: {
    fontFamily: CanvasFonts.display,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  } as TextStyle,
  body: {
    fontFamily: CanvasFonts.body,
    fontSize: 12,
    fontWeight: '500',
  } as TextStyle,
  bodyStrong: {
    fontFamily: CanvasFonts.body,
    fontSize: 12,
    fontWeight: '700',
  } as TextStyle,
  bodyMuted: {
    fontFamily: CanvasFonts.body,
    fontSize: 11,
    fontWeight: '500',
  } as TextStyle,
  caption: {
    fontFamily: CanvasFonts.body,
    fontSize: 10,
    fontWeight: '600',
  } as TextStyle,
};

export const glassShadow: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 10},
  },
  android: {
    elevation: 8,
  },
  default: {},
}) as ViewStyle;

export const cardSurfaceBlue: ViewStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(153, 210, 255, 0.26)',
  backgroundColor: 'rgba(11, 24, 44, 0.8)',
};

export const cardSurfaceViolet: ViewStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(237, 157, 255, 0.24)',
  backgroundColor: 'rgba(24, 12, 35, 0.82)',
};

export const cardSurfaceWarm: ViewStyle = {
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(255, 188, 152, 0.24)',
  backgroundColor: 'rgba(38, 16, 24, 0.84)',
};

