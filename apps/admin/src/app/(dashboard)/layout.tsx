import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { MobileNav, Sidebar } from '@/components/dashboard/sidebar';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMe } from '@/lib/api';
import { canSee, NAV, ROLE_LABEL } from '@/lib/roles';

/** Signed-in shell. The proxy guarantees a session; this loads the admin. */
export default async function DashboardLayout({ children }: LayoutProps<'/'>) {
  const me = await getMe();
  const pathname = (await headers()).get('x-pathname') ?? '/';
  if (me.mustChangePassword && pathname !== '/account/password') redirect('/account/password');

  const items = NAV.filter((item) => canSee(item, me.role));
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';
  const initials = me.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen">
      <Sidebar items={items} showNav={!me.mustChangePassword} defaultCollapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-card/85 px-3 py-3 backdrop-blur sm:gap-3 md:justify-end md:px-8">
          <MobileNav items={items} showNav={!me.mustChangePassword} />
          <div className="flex-1 md:hidden" />
          <ThemeToggle />
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="hidden size-9 place-items-center rounded-full bg-accent text-caption text-accent-foreground sm:grid"
            >
              {initials}
            </span>
            <div className="hidden min-w-0 text-small leading-tight sm:block">
              <p className="font-semibold" data-testid="admin-name">
                {me.name}
              </p>
              <p className="truncate text-muted-foreground">{me.email}</p>
            </div>
          </div>
          <Badge variant="secondary" data-testid="admin-role">
            {ROLE_LABEL[me.role]}
          </Badge>
          <form action="/logout" method="post">
            <Button type="submit" variant="outline" size="sm" aria-label="Log out">
              <LogOut aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
