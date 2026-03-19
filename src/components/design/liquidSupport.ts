import {Platform} from 'react-native';

const asMajorVersion = (value: string | number): number => {
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Number.parseInt(String(value).split('.')[0], 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isLiquidGlassSupported = (): boolean => {
  return Platform.OS === 'android' && asMajorVersion(Platform.Version) >= 33;
};
