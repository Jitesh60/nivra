/**
 * The shared class merger, which knows the Nivra type scale: plain
 * tailwind-merge took `text-small` for a colour and dropped it next to
 * `text-sj-muted-foreground`, so those labels lost their size.
 */
export { cn } from '@sajha/ui';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** ₹1,23,456 (Indian digit grouping). */
export const formatInr = (value: number) => inr.format(Math.round(value));
