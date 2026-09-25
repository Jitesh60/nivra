'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { retryTransferAction } from './actions';
import { StatusMessage } from '@/components/ui/status-message';

/** Retry for a failed transfer to a lender. */
export function RetryButton({ id }: { id: string }) {
  const [state, action] = useActionState(retryTransferAction, {});
  return (
    <form action={action} className="grid justify-items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="h-8 w-fit px-3">Retry</SubmitButton>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
      {state.done && <StatusMessage className="text-caption">{state.done}</StatusMessage>}
    </form>
  );
}
