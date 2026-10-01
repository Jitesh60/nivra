'use client';

import { Button } from '@sajha/ui';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';

type Result = { error?: string; success?: string };

/** Publish a draft, pause or resume a live listing, or delete it. */
export function StatusPanel({
  id,
  status,
  missing,
  publish,
  setPaused,
  remove,
}: {
  id: string;
  status: string;
  missing: string[];
  publish: () => Promise<Result>;
  setPaused: (paused: boolean) => Promise<Result>;
  remove: () => Promise<Result>;
}) {
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Result>) => start(async () => setState(await fn()));

  return (
    <div className="grid gap-3">
      {status === 'DRAFT' &&
        (missing.length ? (
          <p className="text-small text-sj-muted-foreground">
            To publish, add {missing.join(', ')}.
          </p>
        ) : (
          <p className="text-small text-sj-muted-foreground">
            Ready to go. Borrowers will find it in search.
          </p>
        ))}
      <div className="flex flex-wrap gap-2">
        {status === 'DRAFT' && (
          <Button
            type="button"
            disabled={missing.length > 0}
            loading={pending}
            loadingLabel="Publishing"
            onClick={() => run(publish)}
          >
            Publish
          </Button>
        )}
        {status === 'LIVE' && (
          <>
            <Button asChild variant="secondary">
              <Link href={`/item/${id}`}>View as a borrower</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => setPaused(true))}
            >
              Pause
            </Button>
          </>
        )}
        {status === 'PAUSED' && (
          <Button type="button" disabled={pending} onClick={() => run(() => setPaused(false))}>
            Make live again
          </Button>
        )}
        {status !== 'PENDING' && (
          <Button
            type="button"
            variant="ghost"
            className="text-sj-danger"
            disabled={pending}
            onClick={() => {
              if (window.confirm('Delete this listing? This can’t be undone.')) run(remove);
            }}
          >
            Delete
          </Button>
        )}
      </div>
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}
