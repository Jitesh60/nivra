'use client';

import { Button, Input } from '@sajha/ui';
import { useActionState, useEffect, useState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';
import { resendCodeAction, verifyCodeAction, type FormState } from '../actions';

export function VerifyForm({ next, resendAt }: { next: string; resendAt: number }) {
  const [state, verify] = useActionState<FormState, FormData>(verifyCodeAction, {});
  const [resent, resend, resending] = useActionState<FormState>(resendCodeAction, {});
  const [now, setNow] = useState(() => Date.now());
  const until = resent.sent ? resent.sent + 30_000 : resendAt;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const wait = Math.max(0, Math.ceil((until - now) / 1000));

  return (
    <div className="mt-6 grid gap-4">
      <form action={verify} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Code" htmlFor="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="••••••"
            required
            autoFocus
            className="text-center font-mono text-h3 tracking-[0.5em]"
            aria-invalid={Boolean(state.error)}
          />
        </Field>
        <FormMessage error={state.error} />
        <SubmitButton loadingLabel="Checking">Verify and continue</SubmitButton>
      </form>
      <form action={resend} className="text-center">
        <FormMessage
          error={resent.error}
          success={resent.sent ? 'New code sent.' : undefined}
          className="mb-2"
        />
        <Button type="submit" variant="link" disabled={wait > 0 || resending}>
          {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        </Button>
      </form>
    </div>
  );
}
