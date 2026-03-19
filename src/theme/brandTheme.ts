import {MD3DarkTheme, type MD3Theme} from 'react-native-paper';

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
    primary: '#0B1020',
    secondary: '#12192B',
    elevated: '#182033',
  },
  accent: {
    aiBlue: '#4DA3FF',
    electricCyan: '#6FE7FF',
    futureViolet: '#7C6CFF',
  },
  warm: {
    glow: '#FFC58F',
    apricot: '#FFD9B8',
    lightGold: '#FFE6A8',
  },
  text: {
    primary: '#F5F7FB',
    secondary: '#B8C0D4',
    tertiary: '#7D879C',
  },
  border: {
    divider: 'rgba(255,255,255,0.08)',
    light: 'rgba(255,255,255,0.12)',
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
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: BRAND_THEME_TOKENS.accent.aiBlue,
    secondary: BRAND_THEME_TOKENS.accent.futureViolet,
    tertiary: BRAND_THEME_TOKENS.warm.glow,
    background: BRAND_THEME_TOKENS.background.primary,
    surface: BRAND_THEME_TOKENS.background.secondary,
    surfaceVariant: BRAND_THEME_TOKENS.background.elevated,
    error: '#FF8C9B',
    outline: BRAND_THEME_TOKENS.border.light,
    onPrimary: '#081023',
    onSecondary: '#0B1121',
    onBackground: BRAND_THEME_TOKENS.text.primary,
    onSurface: BRAND_THEME_TOKENS.text.secondary,
    onSurfaceVariant: BRAND_THEME_TOKENS.text.tertiary,
  },
};
