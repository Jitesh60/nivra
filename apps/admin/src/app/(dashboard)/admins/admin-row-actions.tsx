'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { updateAdminAction } from './actions';
import { SELECT_CLASS } from './invite-form';

export function AdminRowActions({
  id,
  email,
  role,
  status,
  isSelf,
}: {
  id: string;
  email: string;
  role: string;
  status: string;
  isSelf: boolean;
}) {
  const [state, action, pending] = useActionState(updateAdminAction, {});
  if (isSelf) return <span className="text-sm text-muted-foreground">You</span>;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={action} className="flex gap-2">
        <input type="hidden" name="id" value={id} />
        <select
          name="role"
          defaultValue={role}
          aria-label={`Role for ${email}`}
          className={`${SELECT_CLASS} h-8`}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          disabled={pending}
        >
          <option value="SUPPORT">Support</option>
          <option value="OPS">Ops</option>
          <option value="SUPER_ADMIN">Super Admin</option>
        </select>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="status" value={status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'} />
        <Button
          type="submit"
          size="sm"
          variant={status === 'ACTIVE' ? 'outline' : 'secondary'}
          disabled={pending}
        >
          {status === 'ACTIVE' ? 'Disable' : 'Enable'}
        </Button>
      </form>
      {state.error && <span className="text-sm text-destructive">{state.error}</span>}
    </div>
  );
}
