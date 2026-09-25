import type { Schemas } from '@sajha/api-client';

export type Report = Schemas['AdminReportDto'];
export type ReportStatus = 'OPEN' | 'ACTIONED' | 'DISMISSED';

export const REPORT_TABS: ReportStatus[] = ['OPEN', 'ACTIONED', 'DISMISSED'];

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: 'Open',
  ACTIONED: 'Actioned',
  DISMISSED: 'Dismissed',
};

export const REPORT_REASON_LABEL: Record<string, string> = {
  SPAM: 'Spam',
  SCAM: 'Scam or fraud',
  OFF_PLATFORM_PAYMENT: 'Paying or talking outside Nivra',
  INAPPROPRIATE: 'Rude or inappropriate',
  OTHER: 'Something else',
};

export const REPORT_TARGET_LABEL: Record<string, string> = {
  USER: 'User',
  LISTING: 'Listing',
  MESSAGE: 'Chat message',
};

/** Where to act on what was reported (users: suspend/ban; listings: unpublish). */
export function targetHref(r: Report): string | null {
  if (r.target.type === 'USER') return `/users/${r.target.id}`;
  if (r.target.type === 'LISTING') return `/listings/${r.target.id}`;
  return r.target.ownerId ? `/users/${r.target.ownerId}` : null;
}
