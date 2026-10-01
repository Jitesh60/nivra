'use client';

import { Button, Input } from '@sajha/ui';
import { useActionState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';
import { requestEmailCodeAction, verifyEmailCodeAction, type FormState } from '../actions';

export function EmailForm({ next, initialEmail }: { next: string; initialEmail: string }) {
  const [sent, request] = useActionState<FormState, FormData>(requestEmailCodeAction, {});
  const [checked, verify] = useActionState<FormState, FormData>(verifyEmailCodeAction, {});

  if (!sent.email) {
    return (
      <form action={request} className="mt-6 grid gap-4">
        <Field label="Email" htmlFor="email" error={sent.fields?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={initialEmail}
            required
            autoFocus
          />
        </Field>
        <FormMessage error={sent.error} />
        <SubmitButton loadingLabel="Sending">Email me a code</SubmitButton>
      </form>
    );
  }

  return (
    <div className="mt-6 grid gap-4">
      <p className="text-small text-sj-muted-foreground">
        We sent a code to <span className="font-semibold text-sj-foreground">{sent.email}</span>.
      </p>
      <form action={verify} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Code" htmlFor="email-code">
          <Input
            id="email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            className="text-center font-mono text-h3 tracking-[0.5em]"
          />
        </Field>
        <FormMessage error={checked.error} />
        <SubmitButton loadingLabel="Checking">Verify email</SubmitButton>
      </form>
      <form action={request} className="text-center">
        <input type="hidden" name="email" value={sent.email} />
        <Button type="submit" variant="link">
          Send a new code
        </Button>
      </form>
    </div>
  );
}
