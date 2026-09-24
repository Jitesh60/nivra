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
import { dateTime } from '@/lib/documents';
import { LISTING_STATUS_LABEL, LISTING_TABS, rupees, type ListingStatus } from '@/lib/listings';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Listings' };

export default async function ListingsPage({ searchParams }: PageProps<'/listings'>) {
  const params = await searchParams;
  const status = LISTING_TABS.includes(params.status as ListingStatus)
    ? (params.status as ListingStatus)
    : 'PENDING';
  const search = typeof params.search === 'string' ? params.search.trim() : '';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;

  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/listings', {
      params: {
        query: { status, limit: 25, ...(search ? { search } : {}), ...(cursor ? { cursor } : {}) },
      },
    }),
  );
  const qs = (extra: Record<string, string>) =>
    `/listings?${new URLSearchParams({ status, ...(search ? { search } : {}), ...extra })}`;

  return (
    <>
      <PageHeader
        title="Listings"
        description="A lender’s first listing waits here for review. After one approval, their listings go live straight away."
      />
      <nav aria-label="Listing status" className="mb-4 flex flex-wrap gap-2">
        {LISTING_TABS.map((s) => (
          <Link
            key={s}
            href={`/listings?status=${s}${search ? `&search=${encodeURIComponent(search)}` : ''}`}
            aria-current={s === status ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              s === status ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {LISTING_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <form className="mb-4 flex max-w-md gap-2" role="search">
        <input type="hidden" name="status" value={status} />
        <Input
          name="search"
          defaultValue={search}
          placeholder="Search title, lender name or phone"
          aria-label="Search listings"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Listing</TableHead>
              <TableHead>Lender</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>{status === 'PENDING' ? 'Submitted' : 'Updated'}</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {search
                    ? `No listings match “${search}”.`
                    : status === 'PENDING'
                      ? 'Nothing to review. 🎉'
                      : `No ${LISTING_STATUS_LABEL[status].toLowerCase()} listings.`}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((l) => (
              <TableRow key={l.id} data-testid="listing-row">
                <TableCell>
                  <div className="flex items-center gap-3">
                    {l.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.photos[0].thumbUrl}
                        alt=""
                        className="size-12 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="size-12 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.title}</p>
                      <p className="text-xs text-muted-foreground">{l.category.name}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <p>
                    {l.lender.name ?? '—'}{' '}
                    {l.lender.firstListing && <Badge variant="secondary">first listing</Badge>}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{l.lender.phone}</p>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {rupees(l.pricePerDayPaise)}/day
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {dateTime.format(
                    new Date(status === 'PENDING' && l.publishedAt ? l.publishedAt : l.updatedAt),
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant={status === 'PENDING' ? 'default' : 'outline'}>
                    <Link href={`/listings/${l.id}`}>
                      {status === 'PENDING' ? 'Review' : 'Open'}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {(cursor || page.nextCursor) && (
        <div className="mt-4 flex gap-2">
          {cursor && (
            <Button asChild variant="outline">
              <Link href={qs({})}>First page</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline">
              <Link href={qs({ cursor: page.nextCursor })}>Next page</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
