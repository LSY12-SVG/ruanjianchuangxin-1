export const palette = {
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate150: '#E9EEF6',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate700: '#334155',
  slate900: '#0F172A',
  white: '#FFFFFF',
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
  indigo700: '#4338CA',
  violet500: '#8B5CF6',
  sky400: '#38BDF8',
  emerald500: '#10B981',
  amber500: '#F59E0B',
  rose500: '#F43F5E',
  black: '#020617',
} as const;

export const glassPalette = {
  pageBackground: palette.slate50,
  pageOverlayTop: 'rgba(99, 102, 241, 0.14)',
  pageOverlayBottom: 'rgba(56, 189, 248, 0.12)',
  card: 'rgba(255, 255, 255, 0.76)',
  cardStrong: 'rgba(245, 248, 255, 0.92)',
  cardMuted: 'rgba(240, 245, 255, 0.9)',
  glassBorder: 'rgba(219, 234, 254, 0.95)',
  glassBorderStrong: 'rgba(191, 219, 254, 0.9)',
  input: '#F1F5F9',
  inputFocused: '#FFFFFF',
  tag: '#F1F5F9',
  nav: 'rgba(255, 255, 255, 0.9)',
  navStroke: 'rgba(226, 232, 240, 0.92)',
  fab: 'rgba(15, 23, 42, 0.84)',
  fabGlow: 'rgba(99, 102, 241, 0.2)',
} as const;

export const semanticColors = {
  background: {
    root: glassPalette.pageBackground,
    elevated: palette.white,
    muted: glassPalette.cardMuted,
  },
  text: {
    primary: palette.slate900,
    secondary: palette.slate500,
    tertiary: palette.slate400,
    inverse: palette.white,
  },
  accent: {
    primary: palette.indigo600,
    primaryHover: palette.indigo700,
    secondary: palette.violet500,
    tertiary: palette.sky400,
    gradientStart: palette.violet500,
    gradientEnd: palette.indigo500,
  },
  feedback: {
    success: palette.emerald500,
    warning: palette.amber500,
    danger: palette.rose500,
  },
  border: {
    subtle: glassPalette.glassBorder,
    strong: glassPalette.glassBorderStrong,
    focus: 'rgba(79, 70, 229, 0.28)',
  },
} as const;

export const gradients = {
  page: ['#F8FAFC', '#EEF2FF', '#E0F2FE'] as [string, string, string],
  hero: ['rgba(99,102,241,0.26)', 'rgba(139,92,246,0.12)', 'rgba(56,189,248,0.2)'] as [
    string,
    string,
    string,
  ],
  primary: [palette.violet500, palette.indigo600] as [string, string],
  assistant: ['rgba(99,102,241,0.95)', 'rgba(56,189,248,0.95)'] as [string, string],
} as const;

export const tailwindDesignTokens = {
  colors: {
    background: 'bg-slate-50',
    card: 'bg-white/80',
    primary: 'bg-indigo-600',
    primaryHover: 'bg-indigo-700',
    secondaryGradient: 'bg-gradient-to-r from-violet-500 to-indigo-500',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-500',
    textPlaceholder: 'text-slate-400',
  },
  radius: {
    card: 'rounded-3xl',
    control: 'rounded-2xl',
    pill: 'rounded-full',
  },
  border: {
    subtle: 'border border-slate-100',
  },
  input: {
    base: 'bg-slate-100 focus:ring-2 focus:ring-indigo-500 focus:bg-white',
  },
} as const;
