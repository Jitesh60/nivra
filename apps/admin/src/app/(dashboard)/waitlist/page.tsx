import type { Metadata } from 'next';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, getMe, unwrap } from '@/lib/api';
import { canSee, NAV } from '@/lib/roles';

export const metadata: Metadata = { title: 'Waitlist' };

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const ROLE: Record<string, string> = { BORROWER: 'Borrow', LENDER: 'Lend', BOTH: 'Both' };

export default async function WaitlistPage() {
  const me = await getMe();
  if (
    !canSee(
      NAV.find((i) => i.href === '/waitlist')!,
      me.role,
    )
  )
    return <Forbidden />;

  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/waitlist', { params: { query: { limit: 100 } } }),
  );

  return (
    <>
      <PageHeader
        title="Waitlist"
        description="Sign-ups from the marketing website, newest first."
      />
      <div className="mb-4 flex items-center gap-4">
        <p className="text-sm">
          <span className="text-2xl font-semibold" data-testid="waitlist-total">
            {page.total}
          </span>{' '}
          people
        </p>
        {/* A plain link: the route handler streams the CSV with the admin's token. */}
        <Button asChild variant="outline">
          <a href="/waitlist/export" download>
            Download CSV
          </a>
        </Button>
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No sign-ups yet.
                </TableCell>
              </TableRow>
            )}
            {page.items.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.email}</TableCell>
                <TableCell>{e.city ?? '—'}</TableCell>
                <TableCell>
                  {e.role ? <Badge variant="secondary">{ROLE[e.role]}</Badge> : '—'}
                </TableCell>
                <TableCell>{e.source ?? '—'}</TableCell>
                <TableCell>{dateTime.format(new Date(e.createdAt))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {page.total > page.items.length && (
        <p className="mt-3 text-sm text-muted-foreground">
          Showing the latest {page.items.length}. Download the CSV for everyone.
        </p>
      )}
    </>
  );
}
