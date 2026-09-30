import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { EmailForm } from './email-form';

export const metadata: Metadata = { title: 'Verify your email', robots: { index: false } };

export default async function WelcomeEmailPage({ searchParams }: PageProps<'/welcome/email'>) {
  const next = safeNext((await searchParams).next);
  const me = await getMe();
  if (!me.name) redirect(`/welcome?next=${encodeURIComponent(next)}`);
  if (me.emailVerified) redirect(next);
  return (
    <>
      <p className="text-caption tracking-wide text-sj-primary uppercase">Step 2 of 2</p>
      <h1 className="mt-1 font-display text-h2 text-sj-foreground">Add your email</h1>
      <p className="mt-1 text-small text-sj-muted-foreground">
        Needed before you list or book, for receipts and booking updates.
      </p>
      <EmailForm next={next} initialEmail={me.email ?? ''} />
      <p className="mt-4 text-center text-small">
        <Link href={next} className="text-sj-muted-foreground underline-offset-4 hover:underline">
          Skip for now
        </Link>
      </p>
    </>
  );
}
