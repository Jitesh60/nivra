import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SubmitButton } from '@/components/auth/submit-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { COOKIE } from '@/lib/session';
import { recoveryCodesSavedAction } from '../actions';
import { CopyButtons } from './copy-buttons';

export const metadata: Metadata = { title: 'Save your recovery codes' };

export default async function RecoveryCodesPage({
  searchParams,
}: PageProps<'/login/recovery-codes'>) {
  const { next } = await searchParams;
  const raw = (await cookies()).get(COOKIE.recovery)?.value;
  const codes = raw ? (JSON.parse(raw) as string[]) : null;
  if (!codes) redirect('/');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Save your recovery codes</CardTitle>
        <CardDescription>
          If you lose your phone, each code signs you in once. They won’t be shown again.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul
          data-testid="recovery-codes"
          className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-3 font-mono text-sm"
        >
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <CopyButtons codes={codes} />
        <form action={recoveryCodesSavedAction}>
          <input type="hidden" name="next" value={typeof next === 'string' ? next : '/'} />
          <SubmitButton>I’ve saved them</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
