import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * A tinted pill (DESIGN.md §7). The tint is the tone at 12%; the text is the
 * tone mixed toward the foreground so it stays readable in light and dark.
 */
export const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-2.5 py-1 text-caption font-semibold',
    "[&>svg]:pointer-events-none [&>svg:not([class*='size-'])]:size-3",
  ],
  {
    variants: {
      tone: {
        neutral: 'bg-sj-surface-muted text-sj-foreground',
        brand: 'bg-sj-primary-soft text-sj-on-primary-soft',
        success: 'sj-tint [--tone:var(--sj-success)]',
        warning: 'sj-tint [--tone:var(--sj-warning)]',
        danger: 'sj-tint [--tone:var(--sj-danger)]',
        info: 'sj-tint [--tone:var(--sj-info)]',
        accent: 'sj-tint [--tone:var(--sj-accent)]',
        outline: 'border border-sj-border text-sj-foreground',
      },
    },
    defaultVariants: { tone: 'brand' },
  },
);

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean };

export function Badge({ className, tone, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}
