// Single source of truth for Media Navigator colors.
// - `palette` is loaded by tailwind.config.js, so className colors (bg-primary, text-navy, ...) come from here.
// - `colors` gives the same values as plain strings for props that cannot take a className
//   (icon colors, placeholder text, spinners, RefreshControl tint, gradients).
// Never hardcode hex values in components.

export const palette = {
  // Brand
  navy: { DEFAULT: '#0B1F44', light: '#33476B', deep: '#070F26' },
  primary: { DEFAULT: '#1D5FD1', dark: '#164BA8', bright: '#3B6CF6' },
  sky: { DEFAULT: '#EAF1FD', border: '#C9DAF7' },

  // Accents: used to signal AI, formats and highlights, never as large flat fills.
  violet: { DEFAULT: '#6D4AE8', light: '#F1EDFF', border: '#D9CFFC' },
  magenta: { DEFAULT: '#D6338A', light: '#FDEEF6', border: '#F7C8E0' },
  cyan: { DEFAULT: '#0E8FA6', light: '#E6F7FA', border: '#B5E6EF' },

  // App canvas: a very light cool neutral behind content.
  canvas: '#F5F7FC',

  // Neutral gray scale (text, borders, surfaces)
  neutral: {
    50: '#F7F9FC',
    100: '#EEF2F7',
    200: '#DDE3EC',
    300: '#C3CCD9',
    400: '#7A879C',
    500: '#5F6D84',
  },

  // Semantic
  success: { DEFAULT: '#067647', light: '#ECFDF3', border: '#ABEFC6' },
  warning: { DEFAULT: '#B54708', light: '#FFFAEB', border: '#FEDF89' },
  danger: { DEFAULT: '#B42318', light: '#FEF3F2', border: '#FECDCA' },
  info: { DEFAULT: '#1D5FD1', light: '#EAF1FD', border: '#C9DAF7' },
} as const;

export const colors = {
  white: '#FFFFFF',
  navy: palette.navy.DEFAULT,
  navyLight: palette.navy.light,
  navyDeep: palette.navy.deep,
  primary: palette.primary.DEFAULT,
  primaryBright: palette.primary.bright,
  sky: palette.sky.DEFAULT,
  skyBorder: palette.sky.border,
  violet: palette.violet.DEFAULT,
  violetLight: palette.violet.light,
  magenta: palette.magenta.DEFAULT,
  magentaLight: palette.magenta.light,
  cyan: palette.cyan.DEFAULT,
  cyanLight: palette.cyan.light,
  canvas: palette.canvas,
  neutral100: palette.neutral[100],
  neutral200: palette.neutral[200],
  neutral300: palette.neutral[300],
  neutral400: palette.neutral[400],
  neutral500: palette.neutral[500],
  placeholder: palette.neutral[400],
  success: palette.success.DEFAULT,
  warning: palette.warning.DEFAULT,
  warningLight: palette.warning.light,
  successLight: palette.success.light,
  danger: palette.danger.DEFAULT,
  dangerLight: palette.danger.light,
  info: palette.info.DEFAULT,
  /** Modal backdrop: navy at 45% opacity. */
  backdrop: 'rgba(11, 31, 68, 0.45)',
  /** Translucent white used on dark gradients (secondary text, dividers, chips). */
  onDarkMuted: 'rgba(255, 255, 255, 0.72)',
  onDarkSubtle: 'rgba(255, 255, 255, 0.16)',
} as const;

/**
 * Gradient presets (top-left → bottom-right). Gradients mark hierarchy: `brand` for the one hero
 * surface per screen, `ai` for AI output, `scrim` for text over media. Nothing else gets one.
 */
export const gradients = {
  brand: ['#0B1F44', '#23307F', '#5B3FD0'],
  ai: ['#3B6CF6', '#6D4AE8', '#D6338A'],
  aiSoft: ['#EEF3FF', '#F3EEFF', '#FDF0F7'],
  canvas: ['#EAF1FD', '#F5F7FC', '#FFFFFF'],
  attention: ['#FFF7EB', '#FFFFFF'],
  scrim: ['rgba(7, 15, 38, 0)', 'rgba(7, 15, 38, 0.82)'],
  scrimTop: ['rgba(7, 15, 38, 0.55)', 'rgba(7, 15, 38, 0)'],
} as const satisfies Record<string, readonly [string, string, ...string[]]>;

export type GradientName = keyof typeof gradients;

/**
 * Platform identity: the brand color behind each logo tile, the very soft tint of its dashboard card,
 * and its line color in charts. Tints stay pastel; only the logo tile is saturated.
 */
export const platformColors = {
  instagram: { logo: ['#FEDA75', '#FA7E1E', '#D62976', '#962FBF', '#4F5BD5'], tint: ['#FFF3F8', '#F6F2FF'], border: '#F6DCEA', line: '#D946B8' },
  youtube: { logo: ['#FF0000', '#E60000'], tint: ['#FFF6F6', '#FFF1F3'], border: '#F8DEDE', line: '#EF3B3B' },
  facebook: { logo: ['#1877F2', '#0F64D8'], tint: ['#F3F8FF', '#EEF4FF'], border: '#DCE8FA', line: '#2563EB' },
  linkedin: { logo: ['#0A66C2', '#0857A6'], tint: ['#F1F8FD', '#EDF5FC'], border: '#D7E8F6', line: '#1E3A8A' },
} as const satisfies Record<string, { logo: readonly [string, string, ...string[]]; tint: readonly [string, string]; border: string; line: string }>;
