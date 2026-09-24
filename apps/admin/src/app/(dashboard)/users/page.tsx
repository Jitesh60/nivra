import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, unwrap } from '@/lib/api';

export const metadata: Metadata = { title: 'Users' };

const PAGE_SIZE = 25;
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' });

export default async function UsersPage({ searchParams }: PageProps<'/users'>) {
  const params = await searchParams;
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;

  const api = await adminApi();
  const page = await unwrap(
    api.GET('/v1/admin/users', {
      params: {
        query: { limit: PAGE_SIZE, ...(search ? { search } : {}), ...(cursor ? { cursor } : {}) },
      },
    }),
  );
  const nextHref = page.nextCursor
    ? `/users?${new URLSearchParams({ ...(search ? { search } : {}), cursor: page.nextCursor })}`
    : null;

  return (
    <>
      <PageHeader title="Users" description="People using the Sajha app. Read-only for now." />
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search phone, email or name"
          aria-label="Search users"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {search ? `No users match “${search}”.` : 'No users yet.'}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((user) => (
              <TableRow key={user.id} data-testid="user-row">
                <TableCell className="font-medium">{user.name ?? '—'}</TableCell>
                <TableCell className="font-mono text-xs">
                  {user.phone} {user.phoneVerified && <Badge variant="secondary">verified</Badge>}
                </TableCell>
                <TableCell>
                  {user.email ?? '—'}{' '}
                  {user.emailVerified && <Badge variant="secondary">verified</Badge>}
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === 'ACTIVE' ? 'outline' : 'destructive'}>
                    {user.status.toLowerCase()}
                  </Badge>
                </TableCell>
                <TableCell>{dateFormat.format(new Date(user.createdAt))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex gap-2">
        {cursor && (
          <Button asChild variant="outline">
            <Link href={search ? `/users?search=${encodeURIComponent(search)}` : '/users'}>
              First page
            </Link>
          </Button>
        )}
        {nextHref && (
          <Button asChild variant="outline">
            <Link href={nextHref}>Next page</Link>
          </Button>
        )}
      </div>
    </>
  );
}
