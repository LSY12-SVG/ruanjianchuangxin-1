import {BRAND_THEME_TOKENS} from './brandTheme';

export const VISION_THEME = {
  background: {
    top: '#F7F2EE',
    mid: '#F1E4DB',
    bottom: '#E8D6CC',
    secondary: '#FFFFFF',
    elevated: '#F8F2ED',
    pageGradient: ['#F7F2EE', '#F1E4DB', '#E8D6CC'] as [string, string, string],
  },
  gradients: {
    page: ['#F7F2EE', '#F1E4DB', '#E8D6CC'] as [string, string, string],
    pageAmbient: ['rgba(163, 74, 60, 0.12)', 'rgba(201, 129, 103, 0.09)', 'rgba(255, 255, 255, 0.02)'] as [
      string,
      string,
      string,
    ],
    hero: ['#F1DED1', '#D4A996', '#A34A3C'] as [string, string, string],
    card: ['rgba(186, 114, 90, 0.2)', 'rgba(126, 90, 82, 0.14)', 'rgba(210, 123, 89, 0.12)'] as [
      string,
      string,
      string,
    ],
    cta: ['#B75A48', '#A34A3C', '#7F2F24'] as [string, string, string],
    status: {
      active: ['#4E9B66', '#6CAF7F'] as [string, string],
      warning: ['#D39A49', '#F4D7A6'] as [string, string],
      idle: ['#9F8F85', '#B8A79C'] as [string, string],
    },
  },
  glow: {
    cyanSoft: 'rgba(186, 114, 90, 0.2)',
    cyanStrong: 'rgba(163, 74, 60, 0.3)',
    warmSoft: 'rgba(210, 123, 89, 0.2)',
    warmStrong: 'rgba(163, 74, 60, 0.36)',
  },
  surface: {
    base: 'rgba(255, 255, 255, 0.9)',
    elevated: 'rgba(248, 242, 237, 0.95)',
    card: 'rgba(255, 255, 255, 0.92)',
    glass: 'rgba(163, 74, 60, 0.08)',
    active: 'rgba(163, 74, 60, 0.16)',
    input: 'rgba(252, 246, 242, 0.96)',
    chip: 'rgba(250, 242, 236, 0.96)',
    subtleCard: 'rgba(251, 245, 240, 0.96)',
    nav: 'rgba(44, 38, 34, 0.94)',
  },
  border: {
    soft: BRAND_THEME_TOKENS.border.divider,
    strong: BRAND_THEME_TOKENS.border.light,
    focus: 'rgba(163, 74, 60, 0.5)',
  },
  text: {
    primary: BRAND_THEME_TOKENS.text.primary,
    secondary: BRAND_THEME_TOKENS.text.secondary,
    muted: BRAND_THEME_TOKENS.text.tertiary,
  },
  accent: {
    main: BRAND_THEME_TOKENS.accent.aiBlue,
    strong: BRAND_THEME_TOKENS.accent.electricCyan,
    dark: '#6F2A1E',
    violet: BRAND_THEME_TOKENS.accent.futureViolet,
    warm: BRAND_THEME_TOKENS.warm.glow,
  },
  feedback: {
    success: '#4E9B66',
    warning: BRAND_THEME_TOKENS.warm.lightGold,
    danger: '#C35B63',
  },
  radius: BRAND_THEME_TOKENS.radius,
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
  stroke: {
    thin: 1,
    medium: 1.5,
  },
  shadow: {
    card: {
      color: '#5A4032',
      opacity: 0.12,
      radius: 14,
      elevation: 4,
    },
    nav: {
      color: '#3F2B22',
      opacity: 0.16,
      radius: 16,
      elevation: 6,
    },
  },
  typography: {
    heroTitleSize: 26,
    sectionTitleSize: 16,
    bodySize: 12,
    bodyLineHeight: 18,
    mutedSize: 11,
    captionSize: 10,
  },
  motionPresets: {
    pageEnter: {duration: 280},
    cardEnter: {duration: 240, stagger: 36},
    press: {duration: 150, activeScale: 0.97},
    ambient: {duration: 9000},
  },
  motion: BRAND_THEME_TOKENS.motion,
} as const;
