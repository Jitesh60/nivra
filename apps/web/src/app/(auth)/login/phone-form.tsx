'use client';

import { Input } from '@sajha/ui';
import { useActionState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';
import { requestCodeAction, type FormState } from './actions';

export function PhoneForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestCodeAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Mobile number" htmlFor="phone">
        <div className="flex items-stretch gap-2">
          <span className="grid place-items-center rounded-md border border-sj-input bg-sj-surface-muted px-3 text-body text-sj-muted-foreground">
            +91
          </span>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98765 43210"
            maxLength={14}
            required
            autoFocus
            aria-invalid={Boolean(state.error)}
          />
        </div>
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton loadingLabel="Sending code">Send code</SubmitButton>
    </form>
  );
}
