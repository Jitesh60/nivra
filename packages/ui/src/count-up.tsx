'use client';

import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * Counts up to `to` once, when first scrolled into view.
 * Adapted from React Bits "CountUp" (reactbits.dev, MIT + Commons Clause).
 */
export function CountUp({
  to,
  currency = false,
  format,
  duration = 1.2,
}: {
  to: number;
  /** Format as Indian rupees (₹1,23,456); otherwise plain Indian grouping. */
  currency?: boolean;
  /** A custom formatter; wins over `currency`. */
  format?: (value: number) => string;
  duration?: number;
}) {
  const fmt =
    format ??
    ((n: number) => (currency ? inr.format(Math.round(n)) : Math.round(n).toLocaleString('en-IN')));
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? to : 0);

  useEffect(() => {
    if (!inView || reduceMotion) return;
    const controls = animate(0, to, { duration, ease: 'easeOut', onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduceMotion, to, duration]);

  // Screen readers (and tests) get the final value right away.
  return (
    <span ref={ref}>
      <span className="sr-only">{fmt(to)}</span>
      <span aria-hidden>{fmt(reduceMotion ? to : value)}</span>
    </span>
  );
}
