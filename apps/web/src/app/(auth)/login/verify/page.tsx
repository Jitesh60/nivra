import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readChallenge } from '../actions';
import { VerifyForm } from './verify-form';

export const metadata: Metadata = {
  title: 'Enter your code',
  robots: { index: false },
};

export default async function VerifyPage({ searchParams }: PageProps<'/login/verify'>) {
  const { next } = await searchParams;
  const challenge = await readChallenge();
  const nextPath = typeof next === 'string' ? next : '';
  if (!challenge) redirect(`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`);
  const masked = `+91 ${challenge.phone.slice(0, 2)}••••••${challenge.phone.slice(-2)}`;
  return (
    <>
      <h1 className="font-display text-h2 text-sj-foreground">Enter the code</h1>
      <p className="mt-1 text-small text-sj-muted-foreground">
        We sent a 6-digit code to <span className="font-semibold text-sj-foreground">{masked}</span>
        .{' '}
        <Link
          href={`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
          className="font-semibold text-sj-primary underline-offset-4 hover:underline"
        >
          Change number
        </Link>
      </p>
      <VerifyForm next={nextPath} resendAt={challenge.resendAt} />
    </>
  );
}
