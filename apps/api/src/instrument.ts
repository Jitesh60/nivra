/**
 * Sentry, set up before anything else is imported (it hooks Node's http and
 * Express). Off unless SENTRY_DSN is set; personal data is scrubbed first.
 */
import * as Sentry from '@sentry/nestjs';
import { scrubBreadcrumb, scrubEvent } from './common/observability/scrub.js';

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.GIT_SHA || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
}
