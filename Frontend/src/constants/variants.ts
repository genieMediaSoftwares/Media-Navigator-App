// Component variants built from design tokens (colors.ts, theme.ts). Class strings must stay
// literal so Tailwind can find them. Components pick a variant; they never invent their own colors.

import { colors } from './colors';

export const buttonVariants = {
  primary: { container: 'bg-primary active:bg-primary-dark', text: 'text-white', spinner: colors.white },
  secondary: { container: 'border border-neutral-200 bg-white active:bg-neutral-50', text: 'text-navy', spinner: colors.primary },
  ghost: { container: 'bg-transparent active:bg-sky', text: 'text-primary', spinner: colors.primary },
  danger: { container: 'border border-danger-border bg-white active:bg-danger-light', text: 'text-danger', spinner: colors.danger },
} as const;

export const buttonSizes = {
  md: { container: 'min-h-12 px-xl', text: 'text-body font-semibold', icon: 20 },
  sm: { container: 'min-h-11 px-lg', text: 'text-label font-semibold', icon: 18 },
} as const;

export const inputVariants = {
  default: 'border-neutral-200 bg-white',
  focused: 'border-primary bg-white',
  error: 'border-danger bg-white',
  disabled: 'border-neutral-200 bg-neutral-50',
} as const;

export const noticeVariants = {
  error: { container: 'border-danger-border bg-danger-light', text: 'text-danger', icon: 'alert-circle-outline', color: colors.danger },
  warning: { container: 'border-warning-border bg-warning-light', text: 'text-warning', icon: 'warning-outline', color: colors.warning },
  success: { container: 'border-success-border bg-success-light', text: 'text-success', icon: 'checkmark-circle-outline', color: colors.success },
  info: { container: 'border-info-border bg-info-light', text: 'text-navy', icon: 'information-circle-outline', color: colors.info },
} as const;
