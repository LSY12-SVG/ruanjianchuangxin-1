import {radius} from './radius';
import {spacing} from './spacing';
import {lineHeights, typeScale} from './typography';
import {gradients, glassPalette, palette, semanticColors} from './tokens';

export const VISION_THEME = {
  background: {
    top: palette.slate50,
    mid: '#EEF3FF',
    bottom: palette.slate50,
    secondary: palette.white,
    elevated: glassPalette.cardStrong,
    pageGradient: gradients.page,
  },
  gradients: {
    page: gradients.page,
    pageAmbient: [
      'rgba(99, 102, 241, 0.08)',
      'rgba(56, 189, 248, 0.08)',
      'rgba(255, 255, 255, 0)',
    ] as [string, string, string],
    hero: gradients.hero,
    card: [
      'rgba(139,92,246,0.08)',
      'rgba(79,70,229,0.06)',
      'rgba(56,189,248,0.06)',
    ] as [string, string, string],
    cta: [palette.indigo500, palette.indigo600, palette.indigo700] as [string, string, string],
    status: {
      active: ['#34D399', '#10B981'] as [string, string],
      warning: ['#FBBF24', '#F59E0B'] as [string, string],
      idle: ['#CBD5E1', '#94A3B8'] as [string, string],
    },
  },
  glow: {
    cyanSoft: 'rgba(56, 189, 248, 0.18)',
    cyanStrong: 'rgba(56, 189, 248, 0.28)',
    warmSoft: 'rgba(99, 102, 241, 0.14)',
    warmStrong: 'rgba(99, 102, 241, 0.24)',
  },
  surface: {
    base: glassPalette.card,
    elevated: glassPalette.cardStrong,
    card: glassPalette.card,
    glass: 'rgba(255, 255, 255, 0.55)',
    active: 'rgba(79, 70, 229, 0.14)',
    input: glassPalette.input,
    chip: glassPalette.input,
    subtleCard: glassPalette.cardMuted,
    nav: glassPalette.nav,
  },
  border: {
    soft: semanticColors.border.subtle,
    strong: semanticColors.border.strong,
    focus: semanticColors.border.focus,
  },
  text: {
    primary: semanticColors.text.primary,
    secondary: semanticColors.text.secondary,
    muted: semanticColors.text.tertiary,
  },
  accent: {
    main: semanticColors.accent.primary,
    strong: semanticColors.accent.tertiary,
    dark: palette.slate900,
    violet: semanticColors.accent.secondary,
    warm: semanticColors.accent.primary,
  },
  feedback: semanticColors.feedback,
  radius,
  spacing,
  stroke: {
    thin: 1,
    medium: 1.5,
  },
  shadow: {
    card: {
      color: '#94A3B8',
      opacity: 0.12,
      radius: 16,
      elevation: 4,
    },
    nav: {
      color: '#94A3B8',
      opacity: 0.16,
      radius: 18,
      elevation: 8,
    },
  },
  typography: {
    heroTitleSize: typeScale.hero,
    sectionTitleSize: typeScale.section,
    bodySize: typeScale.body,
    bodyLineHeight: lineHeights.body,
    mutedSize: typeScale.bodySmall,
    captionSize: typeScale.caption,
  },
  motionPresets: {
    pageEnter: {duration: 280},
    cardEnter: {duration: 240, stagger: 36},
    press: {duration: 150, activeScale: 0.97},
    ambient: {duration: 9000},
  },
  motion: {
    reduceMotion: false,
  },
} as const;
