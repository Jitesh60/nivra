import type { ComponentProps } from 'react';
import { cn } from './cn';

/** Surface, 1 px border, radius lg, shadow-sm (DESIGN.md §7). */
export function Card({
  className,
  interactive = false,
  ...props
}: ComponentProps<'div'> & {
  /** A clickable card: lifts 2 px with shadow-md on hover. */
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-6 rounded-lg border border-sj-border bg-sj-surface py-6 text-sj-foreground shadow-sm',
        interactive &&
          'transition-[box-shadow,transform] duration-200 ease-standard hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'grid auto-rows-min items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-title" className={cn('text-h3 font-semibold', className)} {...props} />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-small text-sj-muted-foreground', className)}
      {...props}
    />
  );
}

export function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-footer" className={cn('flex items-center px-6', className)} {...props} />
  );
}
