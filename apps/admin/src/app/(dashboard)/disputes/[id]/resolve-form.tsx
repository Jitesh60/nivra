'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { depositSplit } from '@/lib/disputes';
import { rupees } from '@/lib/listings';
import { rupeesInput, toPaise } from '@/lib/payments';
import { resolveDisputeAction } from '../actions';

/**
 * Amount to keep and a note, with where the deposit goes shown before
 * confirming. Once settled, the page re-renders with the decision instead.
 */
export function ResolveForm({
  id,
  depositPaise,
  lateFeePaise,
  claimPaise,
  maxKeepPaise,
}: {
  id: string;
  depositPaise: number;
  lateFeePaise: number;
  claimPaise: number;
  maxKeepPaise: number;
}) {
  const [state, action] = useActionState(resolveDisputeAction, {});
  const [kept, setKept] = useState(rupeesInput(Math.min(claimPaise, maxKeepPaise)));
  const [confirming, setConfirming] = useState(false);
  const keptPaise = toPaise(kept);
  const valid = keptPaise !== null && keptPaise <= maxKeepPaise;
  const split = valid ? depositSplit(depositPaise, lateFeePaise, keptPaise) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="id" value={id} />
          <Label htmlFor="dispute-kept">Lender keeps (₹)</Label>
          <Input
            id="dispute-kept"
            name="kept"
            inputMode="decimal"
            required
            value={kept}
            onChange={(e) => {
              setKept(e.target.value);
              setConfirming(false);
            }}
            className="max-w-40"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setKept('0')}>
              Nothing
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setKept(rupeesInput(Math.min(claimPaise, maxKeepPaise)))}
            >
              What they asked
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setKept(rupeesInput(maxKeepPaise))}
            >
              Most allowed
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Up to {rupees(maxKeepPaise)} (the deposit less any late fee).
          </p>
          {split ? (
            <div className="grid gap-1 rounded-md bg-muted p-3 text-sm" data-testid="split-preview">
              <div className="flex justify-between gap-4">
                <span>Lender gets</span>
                <span className="font-semibold" data-testid="split-lender">
                  {rupees(split.lenderPaise)}
                </span>
              </div>
              {lateFeePaise > 0 && (
                <p className="text-xs text-muted-foreground">
                  Includes the {rupees(lateFeePaise)} late fee.
                </p>
              )}
              <div className="flex justify-between gap-4">
                <span>Borrower gets back</span>
                <span className="font-semibold" data-testid="split-borrower">
                  {rupees(split.borrowerPaise)}
                </span>
              </div>
            </div>
          ) : (
            <p role="alert" className="text-sm text-destructive">
              Enter an amount from ₹0 to {rupees(maxKeepPaise)}.
            </p>
          )}
          <Label htmlFor="dispute-note">Note (both people see it)</Label>
          <Textarea
            id="dispute-note"
            name="note"
            required
            minLength={3}
            maxLength={1000}
            placeholder="What the photos and chat showed, and why this amount."
          />
          {!confirming ? (
            <Button
              type="button"
              className="w-fit"
              disabled={!valid}
              onClick={() => setConfirming(true)}
            >
              Settle dispute…
            </Button>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm">
                This completes the booking and moves the money now. It can’t be undone.
              </p>
              <SubmitButton className="w-fit">Confirm and settle</SubmitButton>
            </div>
          )}
          {state.error && (
            <p role="alert" data-testid="resolve-error" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
