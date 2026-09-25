import type { Schemas } from '@sajha/api-client';

export type AdminRequest = Schemas['AdminItemRequestDto'];
export type RequestStatus = AdminRequest['status'];

/** Tabs on the Requests page; `ALL` leaves the status filter off. */
export const REQUEST_TABS = ['OPEN', 'CLOSED', 'EXPIRED', 'REMOVED', 'ALL'] as const;
export type RequestTab = (typeof REQUEST_TABS)[number];

export const REQUEST_STATUS_LABEL: Record<RequestTab, string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  EXPIRED: 'Expired',
  REMOVED: 'Removed',
  ALL: 'All',
};

export const REQUEST_STATUS_TONE: Record<
  RequestStatus,
  'success' | 'secondary' | 'outline' | 'destructive'
> = {
  OPEN: 'success',
  CLOSED: 'secondary',
  EXPIRED: 'outline',
  REMOVED: 'destructive',
};

export const COMMON_REQUEST_REMOVE_REASONS = [
  'Asks for something that isn’t allowed on Nivra.',
  'Looks like spam or an advert, not a real request.',
  'Shares contact details or asks to pay outside Nivra.',
  'Offensive or abusive language.',
];

/** "12–14 Oct" style range, or null. */
export function requestDates(r: Pick<AdminRequest, 'startDate' | 'endDate'>): string | null {
  if (!r.startDate) return null;
  const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
  const start = fmt.format(new Date(r.startDate));
  return r.endDate && r.endDate !== r.startDate
    ? `${start} – ${fmt.format(new Date(r.endDate))}`
    : start;
}
