import type { Metadata } from 'next';
import { PhoneForm } from './phone-form';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false },
};

const REASONS: Record<string, string> = {
  expired: 'Your session ended. Please sign in again.',
  suspended: 'This account is suspended. Contact support if you think this is a mistake.',
  signedout: 'You’re signed out.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { next, reason } = await searchParams;
  return (
    <>
      <h1 className="font-display text-h2 text-sj-foreground">Sign in to Nivra</h1>
      <p className="mt-1 text-small text-sj-muted-foreground">
        Rent things near you, or earn from what you own. We’ll text you a code.
      </p>
      {typeof reason === 'string' && REASONS[reason] && (
        <p className="mt-4 rounded-md bg-sj-surface-muted px-3 py-2 text-small">
          {REASONS[reason]}
        </p>
      )}
      <PhoneForm next={typeof next === 'string' ? next : ''} />
    </>
  );
}
