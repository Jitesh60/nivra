// Browser errors to Sentry, only when the build has NEXT_PUBLIC_SENTRY_DSN.
// Loaded lazily so visitors don't download Sentry until it's switched on.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  void Promise.all([import('@sentry/nextjs'), import('./lib/sentry')]).then(
    ([Sentry, { sentryOptions }]) => Sentry.init({ dsn, ...sentryOptions }),
  );
}
