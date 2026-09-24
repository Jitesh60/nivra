import type { Metadata } from 'next';
import { PageHeader } from '@/components/dashboard/page-header';
import { PasswordForm } from '../password-form';

export const metadata: Metadata = { title: 'Choose a new password' };

/** Invited admins land here until they replace their temporary password. */
export default function ForcedPasswordPage() {
  return (
    <>
      <PageHeader
        title="Choose a new password"
        description="You signed in with a temporary password. Pick your own to continue."
      />
      <PasswordForm forced />
    </>
  );
}
