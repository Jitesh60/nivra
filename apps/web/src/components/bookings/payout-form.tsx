'use client';

import { Input } from '@sajha/ui';
import { useActionState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';

type FormState = { error?: string; success?: string; fields?: Record<string, string> };

export function PayoutForm({
  action,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const f = state.fields ?? {};
  const field = (name: string, label: string, props: React.ComponentProps<'input'> = {}) => (
    <Field label={label} htmlFor={name} error={f[name]}>
      <Input id={name} name={name} required {...props} />
    </Field>
  );
  return (
    <form action={formAction} className="grid gap-3">
      {field('beneficiaryName', 'Account holder name', { autoComplete: 'name' })}
      <div className="grid gap-3 sm:grid-cols-2">
        {field('accountNumber', 'Account number', { inputMode: 'numeric', autoComplete: 'off' })}
        {field('accountNumber2', 'Account number again', {
          inputMode: 'numeric',
          autoComplete: 'off',
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('ifsc', 'IFSC', { maxLength: 11, className: 'uppercase' })}
        {field('pan', 'PAN', { maxLength: 10, className: 'uppercase' })}
      </div>
      {field('email', 'Email', { type: 'email', autoComplete: 'email' })}
      {field('street', 'Address', { autoComplete: 'street-address' })}
      <div className="grid gap-3 sm:grid-cols-3">
        {field('city', 'City', { autoComplete: 'address-level2' })}
        {field('state', 'State', { autoComplete: 'address-level1' })}
        {field('postalCode', 'PIN code', {
          inputMode: 'numeric',
          maxLength: 6,
          autoComplete: 'postal-code',
        })}
      </div>
      <FormMessage error={state.error} success={state.success} />
      <div>
        <SubmitButton loadingLabel="Saving">Save bank account</SubmitButton>
      </div>
    </form>
  );
}
