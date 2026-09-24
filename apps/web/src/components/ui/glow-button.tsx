import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pill button with an animated conic-gradient border.
 * Inspired by uiverse.io gradient-border buttons (MIT).
 */
const base =
  'relative inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:pointer-events-none disabled:opacity-60';

const variants = {
  primary: 'glow-border bg-ink-950 text-white',
  light: 'bg-white text-ink-950 shadow-sm hover:bg-ink-50',
  ghost: 'border border-white/25 text-white hover:bg-white/10',
  brand: 'bg-brand-700 text-white hover:bg-brand-800',
} as const;

type Variant = keyof typeof variants;

export function GlowButton({
  variant = 'primary',
  className,
  children,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; children: ReactNode }) {
  return (
    <button className={cn(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function GlowLink({
  variant = 'primary',
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; children: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
