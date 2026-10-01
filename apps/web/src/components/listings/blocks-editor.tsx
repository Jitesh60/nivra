'use client';

import { Button, Input } from '@sajha/ui';
import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';
import { shortDate, todayIst } from '@/lib/format';

type Range = { startsOn: string; endsOn: string };

/** Days the item can't be rented (trips, own use). Saved as a whole list. */
export function BlocksEditor({
  initial,
  max,
  save,
}: {
  initial: Range[];
  max: number;
  save: (ranges: Range[]) => Promise<{ error?: string; success?: string }>;
}) {
  const [ranges, setRanges] = useState(initial);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();

  const commit = (next: Range[]) =>
    start(async () => {
      const result = await save(next);
      setState(result);
      if (!result.error) setRanges(next);
    });

  const addRange = () => {
    if (!from) return setState({ error: 'Pick the first day.' });
    const end = to || from;
    if (end < from) return setState({ error: 'The last day can’t be before the first.' });
    commit(
      [...ranges, { startsOn: from, endsOn: end }].sort((a, b) =>
        a.startsOn.localeCompare(b.startsOn),
      ),
    );
    setFrom('');
    setTo('');
  };

  return (
    <div className="grid gap-3">
      {ranges.length === 0 ? (
        <p className="text-small text-sj-muted-foreground">No blocked dates: bookable any day.</p>
      ) : (
        <ul className="grid gap-2">
          {ranges.map((r, i) => (
            <li
              key={`${r.startsOn}-${r.endsOn}`}
              className="flex items-center justify-between rounded-md border border-sj-border px-3 py-2 text-small"
            >
              {r.startsOn === r.endsOn
                ? shortDate(r.startsOn)
                : `${shortDate(r.startsOn)} – ${shortDate(r.endsOn)}`}
              <button
                type="button"
                disabled={pending}
                onClick={() => commit(ranges.filter((_, j) => j !== i))}
                aria-label={`Unblock ${r.startsOn}`}
                className="grid size-8 place-items-center rounded-full text-sj-danger hover:bg-sj-surface-muted"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {ranges.length < max && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-caption font-semibold">
            First day
            <Input
              type="date"
              min={todayIst()}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-caption font-semibold">
            Last day
            <Input
              type="date"
              min={from || todayIst()}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={addRange}
            loading={pending}
            loadingLabel="Saving"
          >
            Block dates
          </Button>
        </div>
      )}
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}
