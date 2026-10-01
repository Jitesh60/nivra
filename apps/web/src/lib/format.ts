import { formatInr } from './utils';

/** API amounts are in paise: ₹1,234. */
export const rupees = (paise: number) => formatInr(paise / 100);

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const dateYearFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** "2026-10-05" or an ISO timestamp → "5 Oct" (adds the year when it isn't this year). */
export function shortDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return date.getFullYear() === new Date().getFullYear()
    ? dateFmt.format(date)
    : dateYearFmt.format(date);
}

export const longDate = (value: string) => dateYearFmt.format(new Date(value));

export const CONDITION_LABEL: Record<string, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
};

export const DOC_LABEL: Record<string, string> = {
  GOVERNMENT_ID: 'Government ID',
  COLLEGE_OR_EMPLOYEE_ID: 'College or employee ID',
  ADDRESS_PROOF: 'Address proof',
  OTHER: 'Other document',
};

/** Today in India as YYYY-MM-DD (the API's dates are Indian calendar days). */
export function todayIst(offsetDays = 0): string {
  const now = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000);
  return now.toISOString().slice(0, 10);
}

/** "4.8 (12)" or null when unrated. */
export function ratingText(avg?: number | null, count?: number): string | null {
  if (!avg || !count) return null;
  return `${avg.toFixed(1)} (${count})`;
}
