import type { ComponentProps } from 'react';
import { cn } from './cn';

/** A placeholder block with a slow shimmer (off with reduced motion). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('sj-shimmer rounded-md bg-sj-surface-muted', className)}
      {...props}
    />
  );
}
