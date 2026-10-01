'use client';

import { Button, Input } from '@sajha/ui';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';

type Prefs = {
  pushBookings: boolean;
  pushChat: boolean;
  pushReminders: boolean;
  emailBookings: boolean;
  smsReminders: boolean;
  marketing: boolean;
  pushSearchAlerts: boolean;
  pushRequests: boolean;
};
type Result = { error?: string; success?: string };

const ROWS: [keyof Prefs, string, string][] = [
  ['emailBookings', 'Booking emails', 'Requests, confirmations and receipts'],
  ['smsReminders', 'SMS reminders', 'Pickup and return reminders'],
  ['pushBookings', 'Booking alerts (app)', 'On your phone, in the Nivra app'],
  ['pushChat', 'Chat messages (app)', ''],
  ['pushReminders', 'Reminders (app)', ''],
  ['pushSearchAlerts', 'Saved-search alerts', 'New items matching your saved searches'],
  ['pushRequests', 'Requests near you', 'When someone nearby asks for something'],
  ['marketing', 'News and offers', 'Occasional updates from Nivra'],
];

export function PreferencesForm({
  initial,
  save,
}: {
  initial: Prefs;
  save: (p: Partial<Prefs>) => Promise<Result>;
}) {
  const [prefs, setPrefs] = useState(initial);
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      {ROWS.map(([key, label, hint]) => (
        <label key={key} className="flex items-start justify-between gap-3 py-1 text-small">
          <span>
            <span className="font-semibold">{label}</span>
            {hint && <span className="block text-caption text-sj-muted-foreground">{hint}</span>}
          </span>
          <input
            type="checkbox"
            checked={prefs[key]}
            disabled={pending}
            onChange={(e) => {
              const next = { ...prefs, [key]: e.target.checked };
              setPrefs(next);
              start(async () => setState(await save({ [key]: e.target.checked })));
            }}
            className="mt-1 size-5 accent-[var(--sj-primary)]"
          />
        </label>
      ))}
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}

export function DangerZone({ remove }: { remove: (confirm: string) => Promise<Result> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();
  return (
    <section className="grid gap-3 rounded-lg border border-sj-danger/30 bg-sj-surface p-5">
      <h2 className="text-h3 text-sj-danger">Delete account</h2>
      <p className="text-small text-sj-muted-foreground">
        Removes your profile, listings and documents. Booking and payment records we must keep by
        law are kept, without your details. This can’t be undone.
      </p>
      {!open ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="text-sj-danger"
            onClick={() => setOpen(true)}
          >
            Delete my account
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="grid gap-1 text-caption font-semibold">
            Type DELETE to confirm
            <Input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="danger"
              loading={pending}
              loadingLabel="Deleting"
              disabled={text.trim().toUpperCase() !== 'DELETE'}
              onClick={() => start(async () => setState(await remove(text)))}
            >
              Delete forever
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <FormMessage error={state.error} />
        </div>
      )}
    </section>
  );
}
