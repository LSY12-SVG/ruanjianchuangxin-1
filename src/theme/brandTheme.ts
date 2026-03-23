import {MD3LightTheme, type MD3Theme} from 'react-native-paper';

export interface BrandThemeTokens {
  background: {
    primary: string;
    secondary: string;
    elevated: string;
  };
  accent: {
    aiBlue: string;
    electricCyan: string;
    futureViolet: string;
  };
  warm: {
    glow: string;
    apricot: string;
    lightGold: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  border: {
    divider: string;
    light: string;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    pill: number;
  };
  motion: {
    quick: number;
    normal: number;
    slow: number;
  };
}

export const BRAND_THEME_TOKENS: BrandThemeTokens = {
  background: {
    primary: '#F5F1EE',
    secondary: '#FFFFFF',
    elevated: '#F8F2ED',
  },
  accent: {
    aiBlue: '#A34A3C',
    electricCyan: '#C2614F',
    futureViolet: '#7E5A52',
  },
  warm: {
    glow: '#D27B59',
    apricot: '#EFC9B7',
    lightGold: '#F4D7A6',
  },
  text: {
    primary: '#2B2623',
    secondary: '#6A5D56',
    tertiary: '#9A8B82',
  },
  border: {
    divider: 'rgba(116, 91, 78, 0.18)',
    light: 'rgba(116, 91, 78, 0.28)',
  },
  radius: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 30,
    pill: 999,
  },
  motion: {
    quick: 180,
    normal: 280,
    slow: 420,
  },
};

export const PAPER_THEME: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: BRAND_THEME_TOKENS.accent.aiBlue,
    secondary: BRAND_THEME_TOKENS.accent.futureViolet,
    tertiary: BRAND_THEME_TOKENS.warm.glow,
    background: BRAND_THEME_TOKENS.background.primary,
    surface: BRAND_THEME_TOKENS.background.secondary,
    surfaceVariant: BRAND_THEME_TOKENS.background.elevated,
    error: '#C35B63',
    outline: BRAND_THEME_TOKENS.border.light,
    onPrimary: '#FFF7F4',
    onSecondary: '#FFF7F4',
    onBackground: BRAND_THEME_TOKENS.text.primary,
    onSurface: BRAND_THEME_TOKENS.text.secondary,
    onSurfaceVariant: BRAND_THEME_TOKENS.text.tertiary,
  },
};
