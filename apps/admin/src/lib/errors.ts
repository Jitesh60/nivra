import type { ApiErrorBody } from '@sajha/api-client';

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function toApiError(body: unknown): ApiError {
  const error = (body as ApiErrorBody | undefined)?.error;
  if (error?.code) {
    return {
      code: error.code,
      message: error.message,
      details: (error.details as Record<string, unknown> | undefined) ?? undefined,
    };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
}

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  MFA_INVALID: 'That code is incorrect. Check your authenticator app and try again.',
  MFA_ALREADY_ENABLED: 'Two-factor authentication is already set up. Sign in again.',
  MFA_SETUP_REQUIRED: 'Set up your authenticator app first.',
  ACCOUNT_SUSPENDED: 'This account is disabled. Contact a Super Admin.',
  TOKEN_INVALID: 'Your sign-in expired. Please start again.',
  TOKEN_EXPIRED: 'Your sign-in expired. Please start again.',
  PASSWORD_REUSED: 'Choose a password different from your current one.',
  ADMIN_EMAIL_IN_USE: 'An admin with this email already exists.',
  CANNOT_MODIFY_SELF: 'You can’t change your own role or status.',
  FORBIDDEN: 'Your role doesn’t allow this.',
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  NETWORK: 'Can’t reach the Sajha API. Is it running?',
  DOCUMENT_NOT_PENDING: 'This document was already reviewed, maybe by another admin.',
  USER_STATUS_CONFLICT: 'That action doesn’t apply to the user’s current status.',
  NOT_FOUND: 'Not found. It may have been deleted.',
};

export function friendlyMessage(error: ApiError): string {
  if (error.code === 'ACCOUNT_LOCKED') {
    const sec = Number(error.details?.retryAfterSec ?? 900);
    return `Too many failed attempts. Try again in ${Math.ceil(sec / 60)} minutes.`;
  }
  return MESSAGES[error.code] ?? error.message;
}

/** First validation message per field, from `details` of VALIDATION_FAILED. */
export function fieldErrors(error: ApiError): Record<string, string> {
  if (error.code !== 'VALIDATION_FAILED' || !error.details) return {};
  return Object.fromEntries(
    Object.entries(error.details).map(([field, messages]) => [
      field,
      Array.isArray(messages) ? String(messages[0]) : String(messages),
    ]),
  );
}
