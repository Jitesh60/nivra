import type { Schemas } from '@sajha/api-client';

export type AdminListing = Schemas['AdminListingDto'];
export type ListingStatus = AdminListing['status'];
export type AdminCategory = Schemas['AdminCategoryDto'];

/** Queue tabs, in order. DRAFT and DELETED aren't moderated. */
export const LISTING_TABS: ListingStatus[] = ['PENDING', 'LIVE', 'PAUSED', 'REJECTED', 'REMOVED'];

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending review',
  LIVE: 'Live',
  PAUSED: 'Paused',
  REJECTED: 'Rejected',
  REMOVED: 'Removed',
  DELETED: 'Deleted',
};

export const CONDITION_LABEL: Record<AdminListing['condition'], string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  GOOD: 'Good',
  FAIR: 'Fair',
};

export const REQUIRED_DOC_LABEL: Record<AdminListing['requiredDocs'][number]['docType'], string> = {
  GOVERNMENT_ID: 'Government ID',
  COLLEGE_OR_EMPLOYEE_ID: 'College or employee ID',
  ADDRESS_PROOF: 'Address proof',
  OTHER: 'Other',
};

/** Reasons moderators pick most; the lender sees the text as written. */
export const COMMON_LISTING_REASONS = [
  'The photos are blurry or don’t show the item clearly. Please add clearer photos.',
  'The photos don’t match the title or description.',
  'This item isn’t allowed on Nivra (see prohibited items).',
  'The price or deposit looks wrong. Please check the amounts.',
  'Please add more detail: what’s included and the item’s condition.',
  'Contact details aren’t allowed in the title, description or photos.',
];

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

/** "₹1,50,000" from paise. */
export function rupees(paise: number): string {
  return inr.format(paise / 100);
}

/** What the lender keeps from [paise] of rent after the commission. */
export function lenderEarnings(paise: number, commissionBps = 1000): number {
  return paise - Math.round((paise * commissionBps) / 10000);
}

/** Approximate location on openstreetmap.org (never the exact pin). */
export function osmLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`;
}
