'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusMessage } from '@/components/ui/status-message';
import { Textarea } from '@/components/ui/textarea';
import { revokeCreditAction } from '../actions';

/** Take away unused invite credit (Ops and Super Admins, audited). */
export function RevokeCreditForm({ id, balanceRupees }: { id: string; balanceRupees: number }) {
  const [state, action] = useActionState(revokeCreditAction, {});
  return (
    <form action={action} className="grid gap-2 border-t pt-4" data-testid="revoke-credit">
      <input type="hidden" name="id" value={id} />
      <Label htmlFor="revoke-amount">Take credit away</Label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground">
          ₹
        </span>
        <Input
          id="revoke-amount"
          name="amount"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          defaultValue={balanceRupees}
          className="pl-8 font-mono"
          aria-label="Amount to take away, in rupees"
          required
        />
      </div>
      <Textarea
        name="reason"
        aria-label="Reason for taking credit away"
        required
        minLength={3}
        maxLength={300}
        placeholder="Why? (for example: invite abuse). Goes in the audit log."
      />
      <SubmitButton className="w-full bg-destructive text-white hover:bg-destructive/90">
        Take credit away
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-small text-destructive">
          {state.error}
        </p>
      )}
      {state.done && <StatusMessage>{state.done}</StatusMessage>}
    </form>
  );
}
