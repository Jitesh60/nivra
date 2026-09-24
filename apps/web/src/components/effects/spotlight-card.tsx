'use client';

import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card with a soft light that follows the pointer.
 * Adapted from React Bits "SpotlightCard" (reactbits.dev, MIT + Commons Clause).
 */
export function SpotlightCard({
  children,
  className,
  spotlight = 'rgba(29, 164, 130, 0.18)',
}: {
  children: ReactNode;
  className?: string;
  spotlight?: string;
}) {
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
        'group relative overflow-hidden rounded-xl border border-ink-200 bg-white p-6 transition-shadow hover:shadow-lg',
        className,
      )}
      style={{ '--spot': spotlight } as React.CSSProperties}
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
