'use client';

import { Input } from '@sajha/ui';
import { useActionState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';
import { saveNameAction, type FormState } from './actions';

export function NameForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveNameAction, {});
  return (
    <form action={action} className="mt-6 grid gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Full name" htmlFor="name" error={state.fields?.name}>
        <Input id="name" name="name" autoComplete="name" required autoFocus maxLength={80} />
      </Field>
      <Field label="City (optional)" htmlFor="city" error={state.fields?.city}>
        <Input
          id="city"
          name="city"
          autoComplete="address-level2"
          placeholder="Pune"
          maxLength={60}
        />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton loadingLabel="Saving">Continue</SubmitButton>
    </form>
  );
}
