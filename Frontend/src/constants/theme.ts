// Non-color design tokens. Loaded by tailwind.config.js, so each token is also a class:
//   spacing    -> p-lg, gap-md, mt-xl ...
//   radius     -> rounded-md, rounded-lg ...
//   typography -> text-display, text-heading, text-title, text-body, text-label, text-caption
// Use the classes in components; use these objects only where a style prop is required.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
} as const;

export const typography = {
  /** Headline numbers in hero sections. */
  hero: { fontSize: 44, lineHeight: 48, fontWeight: '800' },
  display: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  /** Small uppercase section eyebrows and badges. */
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
} as const;

/** Minimum touch target (dp) for anything tappable. */
export const touchTarget = 44;

/** Shadows are used sparingly: only surfaces that float above content. */
export const elevation = {
  /** Soft lift for hero surfaces and media tiles. */
  float: {
    shadowColor: '#0B1F44',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  sheet: {
    shadowColor: '#0B1F44',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;
