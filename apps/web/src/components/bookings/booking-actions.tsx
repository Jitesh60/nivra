'use client';

import { Button, Textarea } from '@sajha/ui';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';

type Result = { error?: string; success?: string };
type Run = () => Promise<Result>;

/** A button that runs a server action and shows its result. */
export function ActionButton({
  run,
  children,
  variant = 'primary',
  confirm,
}: {
  run: Run;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  confirm?: string;
}) {
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant={variant}
        loading={pending}
        loadingLabel="Working"
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setState(await run()));
        }}
      >
        {children}
      </Button>
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}

/** A button that opens a reason box, then runs the action with the reason. */
export function ReasonAction({
  run,
  label,
  prompt,
  submitLabel,
  required = true,
  intro,
  variant = 'outline',
}: {
  run: (reason: string) => Promise<Result>;
  label: string;
  prompt: string;
  submitLabel: string;
  required?: boolean;
  intro?: React.ReactNode;
  variant?: 'outline' | 'ghost' | 'secondary';
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <div className="grid w-full gap-2 rounded-md border border-sj-border p-3">
      {intro}
      <label className="grid gap-1 text-caption font-semibold">
        {prompt}
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          className="min-h-20"
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="danger"
          loading={pending}
          loadingLabel="Working"
          disabled={required && reason.trim().length < 3}
          onClick={() => start(async () => setState(await run(reason)))}
        >
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}
