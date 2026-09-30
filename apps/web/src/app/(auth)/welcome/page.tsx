import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/api';
import { safeNext } from '@/lib/safe-next';
import { NameForm } from './name-form';

export const metadata: Metadata = { title: 'Welcome', robots: { index: false } };

export default async function WelcomePage({ searchParams }: PageProps<'/welcome'>) {
  const next = safeNext((await searchParams).next);
  const me = await getMe();
  if (me.name)
    redirect(me.emailVerified ? next : `/welcome/email?next=${encodeURIComponent(next)}`);
  return (
    <>
      <p className="text-caption tracking-wide text-sj-primary uppercase">Step 1 of 2</p>
      <h1 className="mt-1 font-display text-h2 text-sj-foreground">What should we call you?</h1>
      <p className="mt-1 text-small text-sj-muted-foreground">
        Lenders and borrowers see your name on listings and in chat.
      </p>
      <NameForm next={next} />
    </>
  );
}
