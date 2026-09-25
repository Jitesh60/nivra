'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { StatusMessage } from '@/components/ui/status-message';
import { Textarea } from '@/components/ui/textarea';
import { COMMON_REQUEST_REMOVE_REASONS } from '@/lib/requests';
import { SELECT_CLASS } from '../../admins/invite-form';
import { removeRequestAction } from '../actions';

/** Take a request off the board (Ops and Super Admins). */
export function RemoveRequestForm({ id }: { id: string }) {
  const [state, action] = useActionState(removeRequestAction, {});
  const [reason, setReason] = useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-title">Moderation</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-2">
          <input type="hidden" name="id" value={id} />
          <p className="text-small text-muted-foreground">
            Takes the request off the board for good. The borrower is told, with this reason.
          </p>
          <Label htmlFor="remove-common">Remove with a reason</Label>
          <select
            id="remove-common"
            aria-label="Common reasons"
            className={`${SELECT_CLASS} w-full min-w-0`}
            value=""
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="" disabled>
              Pick a common reason…
            </option>
            {COMMON_REQUEST_REMOVE_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Textarea
            id="remove-reason"
            name="reason"
            aria-label="Reason shown to the borrower"
            required
            minLength={3}
            maxLength={300}
            placeholder="The borrower sees this reason."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <SubmitButton className="w-full bg-destructive text-white hover:bg-destructive/90">
            Remove request
          </SubmitButton>
          {state.error && (
            <p role="alert" className="text-small text-destructive">
              {state.error}
            </p>
          )}
          {state.done && <StatusMessage>{state.done}</StatusMessage>}
        </form>
      </CardContent>
    </Card>
  );
}
