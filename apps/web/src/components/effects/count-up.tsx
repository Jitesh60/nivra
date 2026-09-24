'use client';

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { formatInr } from '@/lib/utils';

/**
 * Counts up to `to` when scrolled into view.
 * Adapted from React Bits "CountUp" (reactbits.dev, MIT + Commons Clause).
 */
export function CountUp({
  to,
  currency = false,
  duration = 1.2,
}: {
  to: number;
  /** Format as Indian rupees (₹1,23,456); otherwise plain Indian grouping. */
  currency?: boolean;
  duration?: number;
}) {
  const format = (n: number) => (currency ? formatInr(n) : Math.round(n).toLocaleString('en-IN'));
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? to : 0);

  useEffect(() => {
    if (!inView || reduceMotion) return;
    const controls = animate(0, to, { duration, ease: 'easeOut', onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduceMotion, to, duration]);

  // Screen readers get the final value right away.
  return (
    <span ref={ref}>
      <span className="sr-only">{format(to)}</span>
      <span aria-hidden>{format(reduceMotion ? to : value)}</span>
    </span>
  );
}
