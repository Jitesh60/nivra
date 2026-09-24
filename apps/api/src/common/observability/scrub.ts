import type { Breadcrumb, ErrorEvent } from '@sentry/nestjs';

/** Indian mobile numbers (with or without +91) and email addresses. */
const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** Query parameters that carry secrets. */
const SECRET_PARAMS = /([?&](?:code|token|otp|signature|key)=)[^&#]*/gi;
const REDACTED = '[redacted]';

/** Replaces phone numbers, emails and secret query values in free text. */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL, REDACTED)
    .replace(PHONE, REDACTED)
    .replace(SECRET_PARAMS, `$1${REDACTED}`);
}

/**
 * Drops personal data before an error leaves for Sentry: request bodies and
 * cookies, auth headers, the user (only their id is kept), and phone
 * numbers, emails and codes anywhere in messages and URLs.
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      for (const h of Object.keys(headers)) {
        if (/^(authorization|cookie|x-razorpay-signature)$/i.test(h)) headers[h] = REDACTED;
      }
      event.request.headers = headers;
    }
    if (event.request.url) event.request.url = scrubText(event.request.url);
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubText(`?${event.request.query_string}`).slice(1);
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = { ...b };
  if (out.message) out.message = scrubText(out.message);
  if (out.data) {
    out.data = Object.fromEntries(
      Object.entries(out.data).map(([k, v]) => [k, typeof v === 'string' ? scrubText(v) : v]),
    );
  }
  return out;
}
