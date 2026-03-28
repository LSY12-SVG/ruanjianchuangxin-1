import {Platform, type ViewStyle} from 'react-native';

export const softShadow: ViewStyle = Platform.select<ViewStyle>({
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

export const floatingShadow: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: '#6366F1',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: {width: 0, height: 12},
  },
  android: {
    elevation: 8,
  },
  default: {},
}) as ViewStyle;
