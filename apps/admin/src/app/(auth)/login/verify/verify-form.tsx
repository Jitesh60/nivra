'use client';

import { useActionState, useState } from 'react';
import { CodeInput } from '@/components/auth/code-input';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { verifyAction } from '../actions';

export function VerifyForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifyAction, {});
  const [useRecovery, setUseRecovery] = useState(false);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      {useRecovery ? (
        <div className="grid gap-2">
          <Label htmlFor="recoveryCode">Recovery code</Label>
          <Input
            id="recoveryCode"
            name="recoveryCode"
            placeholder="abcd-efgh-jkmn"
            autoComplete="off"
            required
            autoFocus
            className="font-mono"
          />
        </div>
      ) : (
        <CodeInput />
      )}
      <FormError message={state.error} />
      <SubmitButton>Sign in</SubmitButton>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0"
        onClick={() => setUseRecovery((v) => !v)}
      >
        {useRecovery ? 'Use your authenticator app' : 'Lost your phone? Use a recovery code'}
      </Button>
    </form>
  );
}
