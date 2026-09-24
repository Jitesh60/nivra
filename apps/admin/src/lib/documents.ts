import type { Schemas } from '@sajha/api-client';

export type AdminDocument = Schemas['AdminDocumentDto'];
export type DocumentStatus = AdminDocument['status'];

export const DOCUMENT_TYPE_LABEL: Record<AdminDocument['type'], string> = {
  AADHAAR_MASKED: 'Masked Aadhaar',
  PAN: 'PAN card',
  DRIVING_LICENCE: 'Driving licence',
  PASSPORT: 'Passport',
  VOTER_ID: 'Voter ID',
  COLLEGE_ID: 'College ID',
  EMPLOYEE_ID: 'Employee ID',
  ADDRESS_PROOF: 'Address proof',
  OTHER: 'Other',
};

export const DOCUMENT_STATUSES: DocumentStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

/** "Other · Gym card" or "PAN card". */
export function documentTitle(doc: { type: AdminDocument['type']; label?: string | null }) {
  return doc.type === 'OTHER' && doc.label ? `Other · ${doc.label}` : DOCUMENT_TYPE_LABEL[doc.type];
}

/** Reasons reviewers pick most; the text goes to the user as written. */
export const COMMON_REJECTION_REASONS = [
  'The photo is blurry or too dark. Please upload a clearer photo.',
  'Part of the document is cut off. Please include all four corners.',
  'The name doesn’t match your profile name.',
  'The document has expired.',
  'Please upload a masked Aadhaar (only the last 4 digits visible).',
  'This isn’t the document type you selected.',
];

export const dateTime = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});
export const dateOnly = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });
