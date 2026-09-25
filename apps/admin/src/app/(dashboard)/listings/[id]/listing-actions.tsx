'use client';

import { useActionState, useState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { COMMON_LISTING_REASONS } from '@/lib/listings';
import { SELECT_CLASS } from '../../admins/invite-form';
import {
  approveListingAction,
  changeCategoryAction,
  rejectListingAction,
  unpublishListingAction,
  type ListingActionState,
} from '../actions';
import { StatusMessage } from '@/components/ui/status-message';

const DESTRUCTIVE = 'w-full bg-destructive text-white hover:bg-destructive/90';

function Feedback({ state }: { state: ListingActionState }) {
  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  if (state.done) return <StatusMessage>{state.done}</StatusMessage>;
  return null;
}

/** A reason picker (common reasons fill the text) and the reason box. */
function ReasonField({ id, label }: { id: string; label: string }) {
  const [reason, setReason] = useState('');
  return (
    <>
      <Label htmlFor={`${id}-common`}>{label}</Label>
      <select
        id={`${id}-common`}
        aria-label={`Common reasons (${label.toLowerCase()})`}
        className={`${SELECT_CLASS} w-full min-w-0`}
        value=""
        onChange={(e) => setReason(e.target.value)}
      >
        <option value="" disabled>
          Pick a common reason…
        </option>
        {COMMON_LISTING_REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <Textarea
        id={id}
        name="reason"
        aria-label={`Reason shown to the lender (${label.toLowerCase()})`}
        required
        minLength={3}
        maxLength={300}
        placeholder="The lender sees this reason."
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </>
  );
}

export function ModerationActions({ id, status }: { id: string; status: string }) {
  const [approveState, approve] = useActionState(approveListingAction, {});
  const [rejectState, reject] = useActionState(rejectListingAction, {});
  const [unpublishState, unpublish] = useActionState(unpublishListingAction, {});
  const pending = status === 'PENDING';
  const canUnpublish = ['PENDING', 'LIVE', 'PAUSED'].includes(status);
  if (!pending && !canUnpublish) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{pending ? 'Decision' : 'Moderation'}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {pending && (
          <>
            <form action={approve} className="grid gap-2">
              <input type="hidden" name="id" value={id} />
              <SubmitButton>Approve</SubmitButton>
              <Feedback state={approveState} />
            </form>
            <form action={reject} className="grid gap-2 border-t pt-4">
              <input type="hidden" name="id" value={id} />
              <ReasonField id="reject-reason" label="Send back with a reason" />
              <SubmitButton className={DESTRUCTIVE}>Reject</SubmitButton>
              <Feedback state={rejectState} />
            </form>
          </>
        )}
        {canUnpublish && !pending && (
          <form action={unpublish} className="grid gap-2">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-muted-foreground">
              Takes it down for good (prohibited or unsafe items, fraud). The lender sees the
              reason.
            </p>
            <ReasonField id="unpublish-reason" label="Unpublish" />
            <SubmitButton className={DESTRUCTIVE}>Unpublish</SubmitButton>
            <Feedback state={unpublishState} />
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function CategoryAction({
  id,
  categoryId,
  categories,
}: {
  id: string;
  categoryId: string;
  categories: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(changeCategoryAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <Label htmlFor="category">Category</Label>
      <div className="flex gap-2">
        <select
          id="category"
          name="categoryId"
          defaultValue={categoryId}
          className={`${SELECT_CLASS} min-w-0 flex-1`}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <SubmitButton className="w-fit">Move</SubmitButton>
      </div>
      <Feedback state={state} />
    </form>
  );
}
