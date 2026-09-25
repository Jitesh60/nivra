import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Logo } from '@sajha/ui';
import { NavLinks } from '@/components/dashboard/nav-links';
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
  const initials = me.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-card px-3 pt-4 pb-2 md:sticky md:top-0 md:flex md:h-screen md:w-64 md:shrink-0 md:flex-col md:border-r md:border-b-0 md:px-4 md:py-5">
        <Link href="/" className="mb-4 flex rounded-md px-2 md:mb-6" aria-label="Admin home">
          <Logo suffix="Admin" />
        </Link>
        {!me.mustChangePassword && <NavLinks items={items} />}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-end gap-3 border-b bg-card/85 px-4 py-3 backdrop-blur md:px-8">
          <ThemeToggle />
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="hidden size-9 place-items-center rounded-full bg-accent text-caption text-accent-foreground sm:grid"
            >
              {initials}
            </span>
            <div className="min-w-0 text-right text-small leading-tight sm:text-left">
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
            <Button type="submit" variant="outline" size="sm">
              <LogOut aria-hidden />
              Log out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
