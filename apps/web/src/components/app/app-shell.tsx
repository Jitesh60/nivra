import { Logo } from '@sajha/ui';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import type { User } from '@/lib/api';
import { getUnread } from '@/lib/chat';
import { Dock } from './dock';
import { NavLink } from './nav-link';
import { TopSearch } from './top-search';
import { UnreadProvider } from './unread';

/**
 * Signed-in pages: a slim top bar (logo, search, notifications), the page,
 * and the navigation dock floating at the bottom on every screen.
 */
export async function AppShell({ me, children }: { me: User; children: React.ReactNode }) {
  const unread = await getUnread();
  return (
    <UnreadProvider initial={unread}>
      <div className="flex min-h-dvh flex-col bg-sj-background">
        <header className="sticky top-0 z-30 border-b border-sj-border/70 bg-sj-surface/80 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
            <Link href="/" aria-label="Nivra home" className="shrink-0 rounded-md">
              <Logo />
            </Link>
            <TopSearch />
            <div className="flex items-center gap-1">
              <NavLink
                href="/notifications"
                label=""
                ariaLabel="Notifications"
                icon={<Bell />}
                badgeKey="notifications"
              />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-36">{children}</main>
        <Dock name={me.name} avatarUrl={me.avatarUrl} />
      </div>
    </UnreadProvider>
  );
}
