import { Button } from '@sajha/ui';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * The website's names for @sajha/ui buttons (DESIGN.md §7):
 * primary → glow (hero CTA), light → inverse, ghost → inverse-outline,
 * brand → primary.
 */
const VARIANT = {
  primary: 'glow',
  light: 'inverse',
  ghost: 'inverse-outline',
  brand: 'primary',
} as const;

type Variant = keyof typeof VARIANT;
type Size = 'sm' | 'md' | 'lg';

export function GlowButton({
  variant = 'primary',
  size = 'md',
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return <Button variant={VARIANT[variant]} size={size} {...props} />;
}

export function GlowLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Button asChild variant={VARIANT[variant]} size={size} className={className}>
      <Link {...props}>{children}</Link>
    </Button>
  );
}
