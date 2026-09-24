'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePasswordAction } from './actions';

const MIN = 12;

export function PasswordForm({ forced = false }: { forced?: boolean }) {
  const [state, action] = useActionState(changePasswordAction, {});
  const field = (name: string, label: string, autoComplete: string) => (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={name === 'currentPassword' ? 1 : MIN}
        aria-invalid={!!state.fields?.[name]}
      />
      {state.fields?.[name] && <p className="text-sm text-destructive">{state.fields[name]}</p>}
    </div>
  );

  return (
    <form action={action} className="grid max-w-sm gap-4">
      <input type="hidden" name="forced" value={forced ? '1' : '0'} />
      {field(
        'currentPassword',
        forced ? 'Temporary password' : 'Current password',
        'current-password',
      )}
      {field('newPassword', `New password (at least ${MIN} characters)`, 'new-password')}
      {field('confirmPassword', 'Confirm new password', 'new-password')}
      <FormError message={state.error} />
      {state.done && (
        <Alert>
          <AlertDescription>
            Password changed. Your other sessions were signed out.
          </AlertDescription>
        </Alert>
      )}
      <SubmitButton>Change password</SubmitButton>
    </form>
  );
}
