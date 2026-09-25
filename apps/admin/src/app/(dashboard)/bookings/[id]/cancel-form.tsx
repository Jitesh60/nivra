'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COMMON_CANCEL_REASONS } from '@/lib/bookings';
import { cancelBookingAction } from '../actions';
import { StatusMessage } from '@/components/ui/status-message';

/** Cancel with a reason, after a confirm step. Both people are told why. */
export function CancelForm({ id }: { id: string }) {
  const [state, action] = useActionState(cancelBookingAction, {});
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cancel this booking</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!open ? (
          <Button type="button" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
            Cancel booking…
          </Button>
        ) : (
          <form action={action} className="grid gap-2">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-muted-foreground">
              Ends the booking and frees the dates. The borrower and the lender get a notification
              with your reason. It doesn’t count against the lender.
            </p>
            <div className="flex flex-wrap gap-2">
              {COMMON_CANCEL_REASONS.map((r) => (
                <Button
                  key={r}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setReason(r)}
                >
                  {r}
                </Button>
              ))}
            </div>
            <Label htmlFor="cancel-reason">Reason (shown to both people)</Label>
            <Textarea
              id="cancel-reason"
              name="reason"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <SubmitButton className="w-fit bg-destructive text-white hover:bg-destructive/90">
              Confirm cancel
            </SubmitButton>
          </form>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.done && <StatusMessage>{state.done}</StatusMessage>}
      </CardContent>
    </Card>
  );
}
