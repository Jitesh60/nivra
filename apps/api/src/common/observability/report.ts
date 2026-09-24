import * as Sentry from '@sentry/nestjs';

/** Sends an unexpected error to Sentry (a no-op when Sentry is off). */
export function reportError(err: unknown, context?: Record<string, string>): void {
  Sentry.captureException(err, context ? { tags: context } : undefined);
}

/** A background job failed: report it with the queue and job name, not its data. */
export function reportJobFailure(
  queue: string,
  job: { name?: string; id?: string; attemptsMade?: number } | undefined,
  err: Error,
): void {
  reportError(err, {
    queue,
    job: job?.name ?? 'unknown',
    attempt: String(job?.attemptsMade ?? 0),
  });
}
