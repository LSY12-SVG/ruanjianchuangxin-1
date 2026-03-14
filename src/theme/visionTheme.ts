import {BRAND_THEME_TOKENS} from './brandTheme';

export const VISION_THEME = {
  background: {
    top: '#3d0a1f',
    mid: '#5a1230',
    bottom: '#2b1018',
  },
  surface: {
    base: 'rgba(111, 21, 55, 0.74)',
    elevated: 'rgba(56, 17, 31, 0.96)',
    card: 'rgba(78, 24, 42, 0.9)',
    active: 'rgba(255, 122, 69, 0.18)',
  },
  border: {
    soft: 'rgba(255, 188, 160, 0.24)',
    strong: 'rgba(255, 176, 137, 0.46)',
  },
  text: {
    primary: BRAND_THEME_TOKENS.text.headline,
    secondary: BRAND_THEME_TOKENS.text.body,
    muted: BRAND_THEME_TOKENS.text.muted,
  },
  accent: {
    main: BRAND_THEME_TOKENS.palette.sunset,
    strong: BRAND_THEME_TOKENS.palette.sunsetSoft,
    dark: BRAND_THEME_TOKENS.palette.merlotDeep,
  },
  feedback: {
    success: BRAND_THEME_TOKENS.semantic.success,
    warning: BRAND_THEME_TOKENS.semantic.warning,
    danger: BRAND_THEME_TOKENS.semantic.error,
  },
} as const;
