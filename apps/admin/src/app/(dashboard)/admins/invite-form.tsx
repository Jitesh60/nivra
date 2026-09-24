'use client';

import { useActionState } from 'react';
import { FormError } from '@/components/auth/form-error';
import { SubmitButton } from '@/components/auth/submit-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteAdminAction } from './actions';

export const SELECT_CLASS =
  'border-input h-10 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

export function InviteForm() {
  const [state, action] = useActionState(inviteAdminAction, {});

  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <div className="grid gap-2">
          <Label htmlFor="invite-name">Name</Label>
          <Input
            id="invite-name"
            name="name"
            required
            minLength={2}
            aria-invalid={!!state.fields?.name}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            aria-invalid={!!state.fields?.email}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">Role</Label>
          <select id="invite-role" name="role" defaultValue="OPS" className={SELECT_CLASS}>
            <option value="SUPPORT">Support</option>
            <option value="OPS">Ops</option>
            <option value="SUPER_ADMIN">Super Admin</option>
          </select>
        </div>
        <SubmitButton className="md:w-auto">Invite</SubmitButton>
      </form>
      <FormError message={state.error} />
      {state.invited && (
        <Alert data-testid="invite-result">
          <AlertTitle>Invited {state.invited.email}</AlertTitle>
          <AlertDescription>
            <p>
              Temporary password (shown once):{' '}
              <code
                data-testid="temporary-password"
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground"
              >
                {state.invited.temporaryPassword}
              </code>
            </p>
            <p>
              Share it privately. They’ll set up 2FA and choose a new password when they first sign
              in.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
