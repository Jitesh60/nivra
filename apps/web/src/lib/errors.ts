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
  NETWORK: 'Can’t reach Nivra right now. Please try again in a moment.',
  VALIDATION_FAILED: 'Please check the highlighted fields.',
  OTP_INVALID: 'That code is incorrect. Check the SMS and try again.',
  OTP_EXPIRED: 'That code has expired. Send a new one.',
  OTP_TOO_MANY_ATTEMPTS: 'Too many wrong codes. Send a new one.',
  RATE_LIMITED: 'Too many attempts. Please wait a minute and try again.',
  EMAIL_IN_USE: 'Another account already uses this email.',
  ACCOUNT_SUSPENDED: 'This account is suspended. Contact support.',
  VERIFICATION_REQUIRED: 'Verify your email first (Profile → Email).',
  PHONE_NOT_VERIFIED: 'Verify your phone number first.',
  NOT_FOUND: 'Not found. It may have been removed.',
  FORBIDDEN: 'You can’t do that.',
};

export function friendlyMessage(error: ApiError): string {
  if (error.code === 'RATE_LIMITED' || error.code === 'TOO_MANY_REQUESTS') {
    const sec = Number(error.details?.retryAfterSec ?? 0);
    if (sec > 0) return `Too many attempts. Try again in ${Math.ceil(sec / 60)} min.`;
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
