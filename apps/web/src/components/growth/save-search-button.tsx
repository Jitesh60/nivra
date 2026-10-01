'use client';

import { Button } from '@sajha/ui';
import { BellPlus } from 'lucide-react';
import { useState, useTransition } from 'react';
import type { BrowseQuery } from '@/lib/discovery';
import { saveSearchAction } from '@/app/(app)/growth-actions';

/** "Save search" on Explore: alerts when new matching items are listed nearby. */
export function SaveSearchButton({ query, name }: { query: BrowseQuery; name: string }) {
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        disabled={Boolean(state.success)}
        onClick={() => start(async () => setState(await saveSearchAction(query, name)))}
      >
        <BellPlus /> {state.success ? 'Saved' : 'Save search'}
      </Button>
      {(state.error || state.success) && (
        <span
          role="status"
          className={`text-caption ${state.error ? 'text-sj-danger' : 'text-sj-muted-foreground'}`}
        >
          {state.error ?? state.success}
        </span>
      )}
    </div>
  );
}
