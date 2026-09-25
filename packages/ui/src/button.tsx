import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';
import { DotsLoader } from './dots-loader';

/** The Nivra button (DESIGN.md §7): a pill in three heights, 36/44/52. */
export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-sans text-button',
    'transition-[background-color,color,box-shadow,transform] duration-200 ease-standard active:scale-[0.98]',
    'outline-none focus-visible:ring-2 focus-visible:ring-sj-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sj-background',
    'disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        primary:
          'sj-glow-hover bg-sj-primary text-sj-on-primary shadow-xs hover:bg-sj-primary-hover hover:shadow-glow',
        glow: 'sj-glow-border text-white hover:scale-[1.02]',
        secondary:
          'bg-sj-primary-soft text-sj-on-primary-soft hover:bg-[color-mix(in_oklab,var(--sj-primary-soft),var(--sj-primary)_14%)]',
        outline:
          'border border-sj-border bg-transparent text-sj-foreground hover:bg-sj-surface-muted',
        ghost: 'text-sj-foreground hover:bg-sj-surface-muted',
        danger: 'bg-sj-danger text-sj-on-danger shadow-xs hover:bg-sj-danger/90',
        link: 'h-auto! rounded-sm px-0! text-sj-primary underline-offset-4 hover:underline',
        /** White pill for dark backgrounds (the website hero and header). */
        inverse: 'bg-white text-ink-950 shadow-sm hover:bg-ink-100',
        /** Outline for dark backgrounds. */
        'inverse-outline': 'border border-white/30 text-white hover:bg-white/10',
      },
      size: {
        sm: "h-9 px-4 text-small font-semibold [&_svg:not([class*='size-'])]:size-4",
        md: 'h-11 px-5',
        lg: 'h-13 px-6',
        icon: 'size-11',
        'icon-sm': "size-9 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link) with the button's look. */
    asChild?: boolean;
    /** Swap the label for a dots loader; the button keeps its width. */
    loading?: boolean;
    loadingLabel?: string;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  loadingLabel,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      data-slot="button"
      className={classes}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          {/* Invisible but still measured and read, so width and name stay. */}
          <span className="inline-flex items-center gap-[inherit] opacity-0">{children}</span>
          <span className="absolute inset-0 grid place-items-center">
            <DotsLoader label={loadingLabel} />
          </span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
