'use client';

import { useState, useTransition } from 'react';
import { Button } from '@sajha/ui';
import { FormMessage } from '@/components/app/form-bits';

type Required = { id: string; label: string; options: { id: string; label: string }[] };

/** Pick one of your documents for each one the lender asked for. */
export function ShareForm({
  required,
  share,
}: {
  required: Required[];
  share: (
    shares: { requiredDocId: string; userDocumentId: string }[],
  ) => Promise<{ error?: string }>;
}) {
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(required.filter((r) => r.options[0]).map((r) => [r.id, r.options[0]!.id])),
  );
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const complete = required.every((r) => chosen[r.id]);

  return (
    <div className="grid gap-4">
      {required.map((r) => (
        <fieldset
          key={r.id}
          className="grid gap-2 rounded-lg border border-sj-border bg-sj-surface p-4"
        >
          <legend className="px-1 font-semibold">{r.label}</legend>
          {r.options.length === 0 ? (
            <p className="text-small text-sj-muted-foreground">None of your documents fit yet.</p>
          ) : (
            r.options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-small">
                <input
                  type="radio"
                  name={r.id}
                  value={o.id}
                  checked={chosen[r.id] === o.id}
                  onChange={() => setChosen((c) => ({ ...c, [r.id]: o.id }))}
                  className="size-4 accent-[var(--sj-primary)]"
                />
                {o.label}
              </label>
            ))
          )}
        </fieldset>
      ))}
      <FormMessage error={error} />
      <div>
        <Button
          type="button"
          disabled={!complete}
          loading={pending}
          loadingLabel="Sharing"
          onClick={() =>
            start(async () => {
              const result = await share(
                required.map((r) => ({ requiredDocId: r.id, userDocumentId: chosen[r.id]! })),
              );
              if (result?.error) setError(result.error);
            })
          }
        >
          Share with the lender
        </Button>
      </div>
    </div>
  );
}
