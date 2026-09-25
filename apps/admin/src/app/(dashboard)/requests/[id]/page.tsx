import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, ApiRequestError, getMe, unwrap } from '@/lib/api';
import { dateTime } from '@/lib/documents';
import { rupees } from '@/lib/listings';
import { REQUEST_STATUS_LABEL, REQUEST_STATUS_TONE, requestDates } from '@/lib/requests';
import { MODERATORS } from '@/lib/roles';
import { RemoveRequestForm } from './remove-form';

export const metadata: Metadata = { title: 'Request' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default async function RequestPage({ params }: PageProps<'/requests/[id]'>) {
  const { id } = await params;
  const api = await adminApi();
  const [me, r] = await Promise.all([
    getMe(),
    unwrap(api.GET('/v1/admin/requests/{id}', { params: { path: { id } } })).catch(
      (err: unknown) => {
        if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
        throw err;
      },
    ),
  ]);
  const canModerate = MODERATORS.includes(me.role);
  const dates = requestDates(r);

  return (
    <>
      <p className="mb-2 text-small">
        <Link
          href={`/requests?status=${r.status}`}
          className="text-muted-foreground hover:underline"
        >
          ← Requests
        </Link>
      </p>
      <PageHeader title={r.title} description={r.areaLabel} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-title">What they need</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line" data-testid="request-details">
                {r.details}
              </p>
              {r.removedReason && (
                <p
                  className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-small"
                  data-testid="request-removed-reason"
                >
                  <span className="font-semibold">Removed:</span> {r.removedReason}
                </p>
              )}
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-3 font-display text-h3">
              Answers from lenders{' '}
              <span className="text-muted-foreground">({r.responses.length})</span>
            </h2>
            {r.responses.length === 0 ? (
              <p className="text-muted-foreground">No lender has answered yet.</p>
            ) : (
              <ul className="grid gap-3">
                {r.responses.map((a) => (
                  <li
                    key={a.id}
                    data-testid="request-response"
                    className="rounded-lg border bg-card p-4 shadow-sm"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        href={`/users/${a.lender.id}`}
                        className="font-semibold hover:underline"
                      >
                        {a.lender.name ?? 'Lender'}
                      </Link>
                      <span className="text-caption text-muted-foreground">
                        {dateTime.format(new Date(a.createdAt))}
                      </span>
                    </div>
                    {a.listing && (
                      <p className="mt-1 text-small">
                        Offered{' '}
                        <Link
                          href={`/listings/${a.listing.id}`}
                          className="text-primary hover:underline"
                        >
                          {a.listing.title}
                        </Link>{' '}
                        ·{' '}
                        <span className="font-mono">{rupees(a.listing.pricePerDayPaise)}/day</span>
                      </p>
                    )}
                    <p className="mt-2 text-small text-muted-foreground">“{a.message}”</p>
                    <p className="mt-2 text-small">
                      <Link
                        href={`/conversations/${a.conversationId}`}
                        className="text-primary hover:underline"
                      >
                        Open the chat →
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardContent>
              <dl className="text-small">
                <Row label="Status">
                  <Badge variant={REQUEST_STATUS_TONE[r.status]} data-testid="request-status">
                    {REQUEST_STATUS_LABEL[r.status]}
                  </Badge>
                </Row>
                <Row label="Borrower">
                  <Link href={`/users/${r.borrower.id}`} className="text-primary hover:underline">
                    {r.borrower.name ?? '—'}
                  </Link>
                </Row>
                <Row label="Category">{r.category?.name ?? 'Any'}</Row>
                <Row label="Dates">{dates ?? 'Flexible'}</Row>
                <Row label="Budget">
                  <span className="font-mono">
                    {r.budgetPerDayPaise == null ? '—' : `${rupees(r.budgetPerDayPaise)}/day`}
                  </span>
                </Row>
                <Row label="Posted">{dateTime.format(new Date(r.createdAt))}</Row>
                <Row label="Expires">{dateTime.format(new Date(r.expiresAt))}</Row>
                <Row label="Open reports">
                  {r.openReports > 0 ? (
                    <Link href="/reports" className="text-destructive hover:underline">
                      {r.openReports}
                    </Link>
                  ) : (
                    0
                  )}
                </Row>
              </dl>
            </CardContent>
          </Card>
          {r.status === 'OPEN' &&
            (canModerate ? (
              <RemoveRequestForm id={r.id} />
            ) : (
              <p className="text-small text-muted-foreground" data-testid="request-no-moderation">
                Only Ops and Super Admins can remove requests.
              </p>
            ))}
        </div>
      </div>
    </>
  );
}
