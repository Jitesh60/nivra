'use client';

import { Button } from '@sajha/ui';
import { useTransition } from 'react';

export function SavedSearchControls({
  alerts,
  setAlerts,
  remove,
}: {
  alerts: boolean;
  setAlerts: (on: boolean) => Promise<unknown>;
  remove: () => Promise<unknown>;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2 text-small">
        <input
          type="checkbox"
          checked={alerts}
          disabled={pending}
          onChange={(e) => start(async () => void (await setAlerts(e.target.checked)))}
          className="size-4 accent-[var(--sj-primary)]"
        />
        Alerts
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-sj-danger"
        disabled={pending}
        onClick={() => start(async () => void (await remove()))}
      >
        Delete
      </Button>
    </div>
  );
}
