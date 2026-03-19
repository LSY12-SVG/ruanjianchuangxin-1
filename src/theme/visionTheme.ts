import {BRAND_THEME_TOKENS} from './brandTheme';

export const VISION_THEME = {
  background: {
    top: '#070D22',
    mid: '#111D3D',
    bottom: '#1A1440',
    secondary: '#12192B',
    elevated: '#182033',
    pageGradient: ['#070D22', '#17295A', '#2B1660'] as [string, string, string],
  },
  gradients: {
    page: ['#070D22', '#17295A', '#2B1660'] as [string, string, string],
    hero: ['#113466', '#2B1E74', '#7B2D6D'] as [string, string, string],
    card: ['rgba(89,163,255,0.22)', 'rgba(124,108,255,0.18)', 'rgba(255,197,143,0.16)'] as [
      string,
      string,
      string,
    ],
    cta: ['#41A4FF', '#6FE7FF', '#8A59FF'] as [string, string, string],
    status: {
      active: ['#3EA0FF', '#6FE7FF'] as [string, string],
      warning: ['#FFC58F', '#FFE6A8'] as [string, string],
      idle: ['#6C7A93', '#9AA8BF'] as [string, string],
    },
  },
  glow: {
    cyanSoft: 'rgba(111,231,255,0.24)',
    cyanStrong: 'rgba(111,231,255,0.42)',
    warmSoft: 'rgba(255,197,143,0.22)',
    warmStrong: 'rgba(255,197,143,0.4)',
  },
  surface: {
    base: 'rgba(13, 22, 42, 0.78)',
    elevated: 'rgba(24, 32, 51, 0.92)',
    card: 'rgba(20, 30, 48, 0.78)',
    glass: 'rgba(255,255,255,0.08)',
    active: 'rgba(77, 163, 255, 0.18)',
  },
  border: {
    soft: BRAND_THEME_TOKENS.border.divider,
    strong: BRAND_THEME_TOKENS.border.light,
    focus: 'rgba(111, 231, 255, 0.72)',
  },
  text: {
    primary: BRAND_THEME_TOKENS.text.primary,
    secondary: BRAND_THEME_TOKENS.text.secondary,
    muted: BRAND_THEME_TOKENS.text.tertiary,
  },
  accent: {
    main: BRAND_THEME_TOKENS.accent.aiBlue,
    strong: BRAND_THEME_TOKENS.accent.electricCyan,
    dark: '#071226',
    violet: BRAND_THEME_TOKENS.accent.futureViolet,
    warm: BRAND_THEME_TOKENS.warm.glow,
  },
  feedback: {
    success: '#73E2B6',
    warning: BRAND_THEME_TOKENS.warm.lightGold,
    danger: '#FF9BB0',
  },
  radius: BRAND_THEME_TOKENS.radius,
  motion: BRAND_THEME_TOKENS.motion,
} as const;
