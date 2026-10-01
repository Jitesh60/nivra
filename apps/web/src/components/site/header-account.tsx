'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AccountMenu } from '@/components/app/account-menu';
import { cn } from '@/lib/utils';

type Session =
  { signedIn: false } | { signedIn: true; name?: string | null; avatarUrl?: string | null };

/**
 * "Sign in", or the account menu when signed in. Marketing pages are static,
 * so this asks /session from the browser after load.
 */
export function HeaderAccount({ overlay }: { overlay: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/session', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Session>) : { signedIn: false as const }))
      .catch(() => ({ signedIn: false as const }))
      .then((s) => live && setSession(s));
    return () => {
      live = false;
    };
  }, []);

  if (session?.signedIn) {
    return <AccountMenu name={session.name} avatarUrl={session.avatarUrl} inverse={overlay} />;
  }
  return (
    <Link
      href="/login"
      className={cn(
        'text-sm font-semibold transition-opacity',
        session ? 'opacity-85 hover:opacity-100' : 'opacity-0',
      )}
    >
      Sign in
    </Link>
  );
}
