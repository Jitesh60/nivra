'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Link tabs with a pill that slides to the current one (after uiverse.io tab toggles). */
export function SlidingTabs({
  id,
  label,
  items,
}: {
  /** Unique per page, so two tab rows don't share a pill. */
  id: string;
  label: string;
  items: readonly { href: string; label: string; active: boolean }[];
}) {
  const reduceMotion = useReducedMotion();
  return (
    <nav aria-label={label} className="flex rounded-full bg-sj-surface-muted p-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={cn(
            'relative rounded-full px-4 py-1.5 text-small font-semibold transition-colors',
            item.active
              ? 'text-sj-foreground'
              : 'text-sj-muted-foreground hover:text-sj-foreground',
          )}
        >
          {item.active && (
            <motion.span
              layoutId={id}
              transition={
                reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0.25, duration: 0.45 }
              }
              className="absolute inset-0 rounded-full bg-sj-surface shadow-xs"
            />
          )}
          <span className="relative">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
