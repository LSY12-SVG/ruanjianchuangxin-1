import {MD3DarkTheme, type MD3Theme} from 'react-native-paper';

export interface BrandThemeTokens {
  palette: {
    sunset: string;
    sunsetSoft: string;
    merlot: string;
    merlotDeep: string;
    limeGray: string;
    smoke: string;
  };
  surface: {
    base: string;
    elevated: string;
    card: string;
    overlay: string;
    active: string;
  };
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  text: {
    headline: string;
    body: string;
    muted: string;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  elevation: {
    sm: number;
    md: number;
    lg: number;
  };
}

export const BRAND_THEME_TOKENS: BrandThemeTokens = {
  palette: {
    sunset: '#ff7a45',
    sunsetSoft: '#ffb089',
    merlot: '#6f1537',
    merlotDeep: '#3d0a1f',
    limeGray: '#d4d9cf',
    smoke: '#1f1618',
  },
  surface: {
    base: '#2b1018',
    elevated: '#38111f',
    card: '#4a1a2a',
    overlay: 'rgba(24, 8, 13, 0.74)',
    active: 'rgba(255, 122, 69, 0.18)',
  },
  semantic: {
    success: '#85e0a3',
    warning: '#ffd08a',
    error: '#ff9a9a',
    info: '#ffb089',
  },
  text: {
    headline: '#ffece3',
    body: '#f2cfc2',
    muted: '#c9988b',
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  elevation: {
    sm: 2,
    md: 6,
    lg: 10,
  },
};

export const PAPER_THEME: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: BRAND_THEME_TOKENS.palette.sunset,
    secondary: BRAND_THEME_TOKENS.palette.sunsetSoft,
    tertiary: BRAND_THEME_TOKENS.palette.limeGray,
    background: BRAND_THEME_TOKENS.surface.base,
    surface: BRAND_THEME_TOKENS.surface.elevated,
    surfaceVariant: BRAND_THEME_TOKENS.surface.card,
    error: BRAND_THEME_TOKENS.semantic.error,
    outline: 'rgba(255, 200, 180, 0.24)',
    onPrimary: '#301015',
    onSecondary: '#36131a',
    onBackground: BRAND_THEME_TOKENS.text.headline,
    onSurface: BRAND_THEME_TOKENS.text.body,
    onSurfaceVariant: BRAND_THEME_TOKENS.text.muted,
  },
};
