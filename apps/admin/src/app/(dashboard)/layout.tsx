import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NavLinks } from '@/components/dashboard/nav-links';
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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b bg-card p-4 md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <p className="mb-4 px-3 text-sm font-semibold tracking-wide text-primary">Sajha Admin</p>
        {!me.mustChangePassword && <NavLinks items={items} />}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b bg-card px-6 py-3">
          <div className="min-w-0 text-right text-sm leading-tight">
            <p className="font-medium" data-testid="admin-name">
              {me.name}
            </p>
            <p className="truncate text-muted-foreground">{me.email}</p>
          </div>
          <Badge variant="secondary" data-testid="admin-role">
            {ROLE_LABEL[me.role]}
          </Badge>
          <form action="/logout" method="post">
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
