const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** YYYY-MM-DD of [at] in India. */
export function istDate(at: Date): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface AnalyticsRange {
  /** Every IST day in the period, oldest first; the last is today. */
  dates: string[];
  from: string;
  to: string;
  /** The same number of days just before. */
  previousFrom: string;
  previousTo: string;
}

/** The last [days] IST days up to and including today, and the period before. */
export function analyticsRange(days: number, now = new Date()): AnalyticsRange {
  const to = istDate(now);
  const from = addDays(to, -(days - 1));
  return {
    dates: Array.from({ length: days }, (_, i) => addDays(from, i)),
    from,
    to,
    previousFrom: addDays(from, -days),
    previousTo: addDays(from, -1),
  };
}
