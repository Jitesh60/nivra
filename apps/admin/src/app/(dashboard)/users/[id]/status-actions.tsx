'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { userStatusAction, type UserAction } from '../actions';

const COPY: Record<UserAction, { label: string; confirm: string; effect: string }> = {
  suspend: {
    label: 'Suspend',
    confirm: 'Confirm suspend',
    effect: 'Signs them out on every device. They can’t sign in until reactivated.',
  },
  ban: {
    label: 'Ban',
    confirm: 'Confirm ban',
    effect: 'Signs them out on every device and blocks the account. Use for fraud or abuse.',
  },
  reactivate: {
    label: 'Reactivate',
    confirm: 'Confirm reactivate',
    effect: 'They can sign in again.',
  },
};

const AVAILABLE: Record<string, UserAction[]> = {
  ACTIVE: ['suspend', 'ban'],
  SUSPENDED: ['reactivate', 'ban'],
  BANNED: ['reactivate'],
};

/** Suspend / ban / reactivate: pick the action, give a reason, confirm. */
export function StatusActions({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState(userStatusAction, {});
  const [chosen, setChosen] = useState<UserAction | null>(null);
  const actions = AVAILABLE[status] ?? [];
  if (actions.length === 0) return null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a}
            type="button"
            variant={chosen === a ? 'secondary' : 'outline'}
            aria-pressed={chosen === a}
            onClick={() => setChosen(chosen === a ? null : a)}
          >
            {COPY[a].label}
          </Button>
        ))}
      </div>
      {chosen && (
        <form action={action} className="grid gap-2" key={chosen}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="action" value={chosen} />
          <p className="text-sm text-muted-foreground">{COPY[chosen].effect}</p>
          <Label htmlFor="status-reason">Reason (kept in the audit log)</Label>
          <Textarea id="status-reason" name="reason" required minLength={3} maxLength={300} />
          <SubmitButton
            className={
              chosen === 'reactivate'
                ? 'w-fit'
                : 'w-fit bg-destructive text-white hover:bg-destructive/90'
            }
          >
            {COPY[chosen].confirm}
          </SubmitButton>
        </form>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}
