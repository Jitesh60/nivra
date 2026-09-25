import { Badge as SajhaBadge } from '@sajha/ui';
import type { ComponentProps } from 'react';

/** The shadcn Badge API, drawn by @sajha/ui: a tinted pill per DESIGN.md. */
const TONE = {
  default: 'brand',
  secondary: 'neutral',
  destructive: 'danger',
  outline: 'outline',
  success: 'success',
  warning: 'warning',
  info: 'info',
} as const;

function Badge({
  variant,
  ...props
}: Omit<ComponentProps<typeof SajhaBadge>, 'tone'> & { variant?: keyof typeof TONE | null }) {
  return <SajhaBadge tone={TONE[variant ?? 'default']} {...props} />;
}

export { Badge };
