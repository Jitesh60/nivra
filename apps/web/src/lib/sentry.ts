import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET_PARAMS = /([?&](?:code|token|otp|signature|key)=)[^&#]*/gi;
const REDACTED = '[redacted]';

export const scrubText = (text: string) =>
  text.replace(EMAIL, REDACTED).replace(PHONE, REDACTED).replace(SECRET_PARAMS, `$1${REDACTED}`);

/**
 * Keep personal data (emails typed in the waitlist, phone numbers) out of
 * Sentry: drops request bodies, cookies and auth headers, keeps only a user
 * id, and masks phones, emails and codes in messages and URLs.
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([h]) => !/^(authorization|cookie)$/i.test(h)),
      );
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
  return {
    ...b,
    ...(b.message ? { message: scrubText(b.message) } : {}),
    ...(b.data
      ? {
          data: Object.fromEntries(
            Object.entries(b.data).map(([k, v]) => [k, typeof v === 'string' ? scrubText(v) : v]),
          ),
        }
      : {}),
  };
}

/** Shared options; each runtime adds its DSN. No tracing, replay or PII. */
export const sentryOptions = {
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
