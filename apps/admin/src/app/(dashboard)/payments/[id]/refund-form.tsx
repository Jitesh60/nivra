'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { rupees } from '@/lib/listings';
import { COMMON_REFUND_REASONS, rupeesInput } from '@/lib/payments';
import { refundAction } from '../actions';

/** A goodwill refund (Sajha pays for it), after a confirm step. */
export function RefundForm({ id, refundablePaise }: { id: string; refundablePaise: number }) {
  const [state, action] = useActionState(refundAction, {});
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Refund</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!open ? (
          <Button type="button" variant="outline" className="w-fit" onClick={() => setOpen(true)}>
            Refund…
          </Button>
        ) : (
          <form action={action} className="grid gap-2">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-muted-foreground">
              Up to {rupees(refundablePaise)} is left to refund. This is a goodwill refund: Sajha
              pays for it, the lender’s payout doesn’t change, and the borrower is told. It’s in the
              audit log.
            </p>
            <Label htmlFor="refund-amount">Amount (₹)</Label>
            <Input
              id="refund-amount"
              name="amount"
              inputMode="decimal"
              required
              defaultValue={rupeesInput(refundablePaise)}
              className="max-w-40"
            />
            <div className="flex flex-wrap gap-2">
              {COMMON_REFUND_REASONS.map((r) => (
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
            <Label htmlFor="refund-reason">Reason (audit log)</Label>
            <Textarea
              id="refund-reason"
              name="reason"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <SubmitButton className="w-fit">Confirm refund</SubmitButton>
          </form>
        )}
        {state.error && (
          <p role="alert" data-testid="refund-error" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.done && (
          <p role="status" data-testid="refund-done" className="text-sm text-primary">
            {state.done}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
