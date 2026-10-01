'use client';

import { Input, Textarea } from '@sajha/ui';
import { useActionState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';
import { saveProfileAction, type FormState } from './actions';

export function ProfileForm({ name, city, bio }: { name: string; city: string; bio: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveProfileAction, {});
  return (
    <form action={action} className="grid gap-4">
      <Field label="Full name" htmlFor="name" error={state.fields?.name}>
        <Input id="name" name="name" defaultValue={name} required maxLength={80} />
      </Field>
      <Field label="City" htmlFor="city" error={state.fields?.city}>
        <Input id="city" name="city" defaultValue={city} maxLength={60} />
      </Field>
      <Field
        label="About you"
        htmlFor="bio"
        error={state.fields?.bio}
        hint="A line or two. Optional."
      >
        <Textarea id="bio" name="bio" defaultValue={bio} maxLength={280} />
      </Field>
      <FormMessage error={state.error} success={state.success} />
      <div>
        <SubmitButton loadingLabel="Saving">Save profile</SubmitButton>
      </div>
    </form>
  );
}
