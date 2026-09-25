import type { Schemas } from '@sajha/api-client';

export type Analytics = Schemas['AnalyticsDto'];
export type Metrics = Schemas['AnalyticsMetricsDto'];

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export function periodFrom(value: unknown): Period {
  const n = Number(value);
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : 30;
}

/** "+12%", "−5%", "new" (from zero) or "±0%" against the previous period. */
export function change(now: number, before: number): { text: string; up: boolean | null } {
  if (before === 0) return now === 0 ? { text: '±0%', up: null } : { text: 'new', up: true };
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return { text: '±0%', up: null };
  return { text: `${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`, up: pct > 0 };
}

const shortDay = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
/** "12 Oct" from an ISO date (IST day). */
export const dayLabel = (iso: string) => shortDay.format(new Date(`${iso}T00:00:00Z`));
