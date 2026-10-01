'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type UnreadCounts = { conversations: number; messages: number; notifications: number };

const UnreadContext = createContext<UnreadCounts | null>(null);

const POLL_MS = 30_000;

/** Unread chat and notification counts for the nav badges, refreshed every 30 s. */
export function UnreadProvider({
  initial,
  children,
}: {
  initial: UnreadCounts | null;
  children: React.ReactNode;
}) {
  const [counts, setCounts] = useState(initial);
  useEffect(() => {
    const load = () => {
      if (document.visibilityState !== 'visible') return;
      fetch('/unread', { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<UnreadCounts>) : null))
        .then((c) => c && setCounts(c))
        .catch(() => undefined);
    };
    const timer = setInterval(load, POLL_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);
  return <UnreadContext.Provider value={counts}>{children}</UnreadContext.Provider>;
}

export function useUnread(key?: 'conversations' | 'notifications'): number | undefined {
  const counts = useContext(UnreadContext);
  return key && counts ? counts[key] : undefined;
}
