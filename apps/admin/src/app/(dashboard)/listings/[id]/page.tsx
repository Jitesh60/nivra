import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, ApiRequestError, getMe, unwrap } from '@/lib/api';
import { dateOnly, dateTime } from '@/lib/documents';
import {
  CONDITION_LABEL,
  lenderEarnings,
  LISTING_STATUS_LABEL,
  osmLink,
  REQUIRED_DOC_LABEL,
  rupees,
} from '@/lib/listings';
import { MODERATORS } from '@/lib/roles';
import { CategoryAction, ModerationActions } from './listing-actions';

export const metadata: Metadata = { title: 'Listing' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default async function ListingPage({ params }: PageProps<'/listings/[id]'>) {
  const { id } = await params;
  const api = await adminApi();
  const [me, listing, config] = await Promise.all([
    getMe(),
    unwrap(api.GET('/v1/admin/listings/{id}', { params: { path: { id } } })).catch(
      (err: unknown) => {
        if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
        throw err;
      },
    ),
    unwrap(api.GET('/v1/config')),
  ]);
  const canModerate = MODERATORS.includes(me.role);
  const categories = canModerate ? await unwrap(api.GET('/v1/admin/categories')) : [];
  const l = listing;
  const weekly =
    l.weeklyDiscountPct > 0
      ? Math.round((l.pricePerDayPaise * 7 * (100 - l.weeklyDiscountPct)) / 100)
      : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={`/listings?status=${l.status}`}
          className="text-muted-foreground hover:underline"
        >
          ← Listings
        </Link>
      </p>
      <PageHeader
        title={l.title}
        description={`${l.category.name} · ${CONDITION_LABEL[l.condition]}`}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          <section aria-label="Photos" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {l.photos.map((p, i) => (
              <a
                key={p.id}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="relative block overflow-hidden rounded-lg border bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumbUrl}
                  alt={`Photo ${i + 1} of ${l.photos.length}`}
                  className="aspect-[4/3] w-full object-cover"
                  data-testid="listing-photo"
                />
                {i === 0 && (
                  <Badge className="absolute top-2 left-2" variant="secondary">
                    cover
                  </Badge>
                )}
              </a>
            ))}
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p className="whitespace-pre-line">{l.description}</p>
              {(l.brand || l.size) && (
                <p className="text-muted-foreground">
                  {[l.brand && `Brand: ${l.brand}`, l.size && `Size: ${l.size}`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="text-sm">
                  <Row label="Per day">
                    <span data-testid="listing-price">{rupees(l.pricePerDayPaise)}</span>
                  </Row>
                  <Row label="Lender earns per day">
                    {rupees(lenderEarnings(l.pricePerDayPaise, config.commissionBps))}
                  </Row>
                  {weekly !== null && (
                    <Row label={`7 days (${l.weeklyDiscountPct}% off)`}>{rupees(weekly)}</Row>
                  )}
                  <Row label="Refundable deposit">{rupees(l.depositPaise)}</Row>
                </dl>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Availability</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="text-sm">
                  <Row label="Rental length">
                    {l.minDays}–{l.maxDays} days
                  </Row>
                  <Row label="Advance notice">
                    {l.advanceNoticeDays} {l.advanceNoticeDays === 1 ? 'day' : 'days'}
                  </Row>
                  <Row label="Blocked">
                    {l.blocks.length === 0
                      ? 'None'
                      : l.blocks
                          .map((b) =>
                            b.startsOn === b.endsOn
                              ? dateOnly.format(new Date(b.startsOn))
                              : `${dateOnly.format(new Date(b.startsOn))} – ${dateOnly.format(new Date(b.endsOn))}`,
                          )
                          .join(', ')}
                  </Row>
                </dl>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pickup area</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-1 text-sm">
                <p>{l.areaLabel ?? '—'}</p>
                {l.approxLat !== null && l.approxLat !== undefined && l.approxLng != null && (
                  <a
                    href={osmLink(l.approxLat, l.approxLng)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Approximate location on OpenStreetMap ↗
                  </a>
                )}
                <p className="text-xs text-muted-foreground">
                  The exact address is encrypted and only shared with a confirmed borrower.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Borrower must share</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {l.requiredDocs.length === 0 ? (
                  <p className="text-muted-foreground">No documents</p>
                ) : (
                  <ul className="list-inside list-disc">
                    {l.requiredDocs.map((d) => (
                      <li key={d.docType}>
                        {REQUIRED_DOC_LABEL[d.docType]}
                        {d.note && `: ${d.note}`}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Status
                <Badge
                  data-testid="listing-status"
                  variant={
                    l.status === 'LIVE'
                      ? 'default'
                      : l.status === 'REJECTED' || l.status === 'REMOVED'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {LISTING_STATUS_LABEL[l.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {l.publishedAt && <p>Published {dateTime.format(new Date(l.publishedAt))}</p>}
              <p>Updated {dateTime.format(new Date(l.updatedAt))}</p>
              {l.reviewedAt && (
                <p>
                  Reviewed {dateTime.format(new Date(l.reviewedAt))}
                  {l.reviewedBy && ` by ${l.reviewedBy}`}
                </p>
              )}
              {l.rejectionReason && <p className="text-destructive">Reason: {l.rejectionReason}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lender</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p className="font-medium">
                {l.lender.name ?? '—'}{' '}
                {l.lender.firstListing && (
                  <Badge variant="secondary" data-testid="first-listing">
                    first listing
                  </Badge>
                )}
              </p>
              <p className="font-mono text-xs">{l.lender.phone}</p>
              <p>{l.lender.city ?? 'No city'}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {(
                  [
                    ['Phone', l.lender.phoneVerified],
                    ['Email', l.lender.emailVerified],
                    ['ID', l.lender.idVerified],
                  ] as const
                ).map(([label, ok]) => (
                  <Badge key={label} variant={ok ? 'default' : 'outline'}>
                    {ok ? '✓' : '✗'} {label}
                  </Badge>
                ))}
              </div>
              {l.lender.status !== 'ACTIVE' && (
                <p className="text-destructive">Account {l.lender.status.toLowerCase()}</p>
              )}
              <Link href={`/users/${l.lender.id}`} className="mt-1 text-primary hover:underline">
                Open lender →
              </Link>
            </CardContent>
          </Card>

          {canModerate ? (
            <>
              <ModerationActions id={l.id} status={l.status} />
              {l.status !== 'DELETED' && (
                <Card>
                  <CardContent className="pt-6">
                    <CategoryAction
                      id={l.id}
                      categoryId={l.category.id}
                      categories={categories.filter((c) => c.isActive || c.id === l.category.id)}
                    />
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only Ops and Super Admins can approve, reject or unpublish listings.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
