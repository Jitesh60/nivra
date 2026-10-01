import { Badge, Button, EmptyState, PageHeader } from '@sajha/ui';
import { ImageOff, PackagePlus, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { rupees } from '@/lib/format';
import { getMyListings, STATUS } from '@/lib/listings';

export const metadata: Metadata = { title: 'My listings' };

export default async function MyListingsPage({ searchParams }: PageProps<'/listings'>) {
  const [listings, { deleted }] = await Promise.all([getMyListings(), searchParams]);
  const visible = listings.filter((l) => l.status !== 'DELETED');
  return (
    <div className="grid gap-6">
      <PageHeader
        title="My listings"
        description="Things you lend. Earn from what sits idle, and borrow from others with the same account."
        actions={
          visible.length > 0 && (
            <Button asChild>
              <Link href="/listings/new">
                <Plus /> List an item
              </Link>
            </Button>
          )
        }
      />
      {deleted && (
        <p role="status" className="rounded-md bg-sj-surface-muted px-4 py-3 text-small">
          Listing deleted.
        </p>
      )}
      {visible.length === 0 ? (
        <EmptyState
          icon={<PackagePlus />}
          title="Nothing listed yet"
          description="Tents, cameras, drills, speakers: list something you rarely use and earn when others rent it."
          action={
            <Button asChild>
              <Link href="/listings/new">List your first item</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {visible.map((l) => {
            const status = STATUS[l.status];
            return (
              <li key={l.id}>
                <Link
                  href={`/listings/${l.id}`}
                  className="flex items-center gap-4 rounded-lg border border-sj-border bg-sj-surface p-3 shadow-xs transition-shadow hover:shadow-md"
                >
                  <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md bg-sj-surface-muted text-sj-muted-foreground">
                    {l.photos[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element -- public storage URL
                      <img src={l.photos[0].thumbUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <ImageOff className="size-6" />
                    )}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate font-semibold">{l.title}</span>
                    <span className="text-small text-sj-muted-foreground">
                      {rupees(l.pricePerDayPaise)} / day · {l.category.name}
                    </span>
                    <span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
