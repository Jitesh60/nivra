'use client';

import { useRef, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { cn } from './cn';

/**
 * Card with a soft light that follows the pointer.
 * Adapted from React Bits "SpotlightCard" (reactbits.dev, MIT + Commons Clause).
 */
export function SpotlightCard({
  children,
  className,
  spotlight = 'color-mix(in oklab, var(--sj-primary) 18%, transparent)',
  ...props
}: {
  children: ReactNode;
  className?: string;
  spotlight?: string;
} & Omit<ComponentProps<'div'>, 'children'>) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      onPointerMove={(e) => {
        const rect = ref.current!.getBoundingClientRect();
        ref.current!.style.setProperty('--x', `${e.clientX - rect.left}px`);
        ref.current!.style.setProperty('--y', `${e.clientY - rect.top}px`);
      }}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-sj-border bg-sj-surface p-6 text-sj-foreground shadow-sm transition-shadow duration-200 hover:shadow-md',
        className,
      )}
      style={{ '--spot': spotlight } as CSSProperties}
      {...props}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(240px circle at var(--x, 50%) var(--y, 50%), var(--spot), transparent 70%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
