import { Logo } from '@sajha/ui';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import type { User } from '@/lib/api';
import { getUnread } from '@/lib/chat';
import { APP_NAV, BROWSE_LINK } from '@/lib/app-nav';
import { AccountMenu } from './account-menu';
import { NavLink } from './nav-link';
import { UnreadProvider } from './unread';

/** Signed-in pages: a top bar (desktop), a bottom bar (phones) and the page. */
export async function AppShell({ me, children }: { me: User; children: React.ReactNode }) {
  const unread = await getUnread();
  return (
    <UnreadProvider initial={unread}>
      <div className="flex min-h-dvh flex-col bg-sj-background">
        <header className="sticky top-0 z-30 border-b border-sj-border bg-sj-surface/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
            <Link href="/" aria-label="Nivra home" className="rounded-md">
              <Logo />
            </Link>
            <nav aria-label="App" className="ml-4 hidden items-center gap-1 md:flex">
              <NavLink
                href={BROWSE_LINK.href}
                label={BROWSE_LINK.label}
                icon={<BROWSE_LINK.icon />}
              />
              {APP_NAV.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={<item.icon />}
                  badgeKey={item.badgeKey}
                />
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <NavLink
                href="/notifications"
                label=""
                ariaLabel="Notifications"
                icon={<Bell />}
                badgeKey="notifications"
              />
              <AccountMenu name={me.name} avatarUrl={me.avatarUrl} />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-24 md:pb-12">{children}</main>
        <nav
          aria-label="App"
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-sj-border bg-sj-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <NavLink
            href={BROWSE_LINK.href}
            label={BROWSE_LINK.label}
            icon={<BROWSE_LINK.icon />}
            compact
          />
          {APP_NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={<item.icon />}
              badgeKey={item.badgeKey}
              compact
            />
          ))}
        </nav>
      </div>
    </UnreadProvider>
  );
}
