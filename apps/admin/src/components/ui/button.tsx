import { Button as SajhaButton, buttonVariants as sajhaButtonVariants } from '@sajha/ui';
import type { ComponentProps } from 'react';

/**
 * The shadcn Button API, drawn by @sajha/ui (DESIGN.md §7). shadcn names map
 * onto Sajha ones: default → primary, destructive → danger, size default → md.
 */
const VARIANT = {
  default: 'primary',
  destructive: 'danger',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'link',
} as const;

const SIZE = { default: 'md', sm: 'sm', lg: 'lg', icon: 'icon' } as const;

type Variant = keyof typeof VARIANT;
type Size = keyof typeof SIZE;

function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: { variant?: Variant | null; size?: Size | null; className?: string } = {}) {
  return sajhaButtonVariants({
    variant: VARIANT[variant ?? 'default'],
    size: SIZE[size ?? 'default'],
    className,
  });
}

function Button({
  variant,
  size,
  ...props
}: Omit<ComponentProps<typeof SajhaButton>, 'variant' | 'size'> & {
  variant?: Variant | null;
  size?: Size | null;
}) {
  return (
    <SajhaButton
      variant={VARIANT[variant ?? 'default']}
      size={SIZE[size ?? 'default']}
      {...props}
    />
  );
}

export { Button, buttonVariants };
