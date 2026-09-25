import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

/** Server-side errors to Sentry, only when SENTRY_DSN is set. */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (dsn) Sentry.init({ dsn, ...sentryOptions });
}

export const onRequestError = Sentry.captureRequestError;
