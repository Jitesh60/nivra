import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

// Browser errors to Sentry, only when the build has NEXT_PUBLIC_SENTRY_DSN.
// No session replay: admin screens show people's personal data.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) Sentry.init({ dsn, ...sentryOptions });
