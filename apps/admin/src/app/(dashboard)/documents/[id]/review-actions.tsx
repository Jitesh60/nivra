'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COMMON_REJECTION_REASONS } from '@/lib/documents';
import { SELECT_CLASS } from '../../admins/invite-form';
import { approveDocumentAction, rejectDocumentAction } from '../actions';

export function ReviewActions({ id }: { id: string }) {
  const [approveState, approve] = useActionState(approveDocumentAction, {});
  const [rejectState, reject] = useActionState(rejectDocumentAction, {});
  const [reason, setReason] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Decision</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={approve} className="grid gap-2">
          <input type="hidden" name="id" value={id} />
          <SubmitButton>Approve</SubmitButton>
          {approveState.error && (
            <p role="alert" className="text-sm text-destructive">
              {approveState.error}
            </p>
          )}
        </form>

        <form action={reject} className="grid gap-2 border-t pt-4">
          <input type="hidden" name="id" value={id} />
          <Label htmlFor="common-reason">Reject with a reason</Label>
          <select
            id="common-reason"
            aria-label="Common reasons"
            className={`${SELECT_CLASS} w-full min-w-0`}
            value=""
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="" disabled>
              Pick a common reason…
            </option>
            {COMMON_REJECTION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <Label htmlFor="reason" className="sr-only">
            Reason shown to the user
          </Label>
          <Textarea
            id="reason"
            name="reason"
            required
            minLength={3}
            maxLength={300}
            placeholder="The user sees this reason."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <SubmitButton className="w-full bg-destructive text-white hover:bg-destructive/90">
            Reject
          </SubmitButton>
          {rejectState.error && (
            <p role="alert" className="text-sm text-destructive">
              {rejectState.error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
