import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { adminApi, ApiRequestError, getMe, unwrap } from '@/lib/api';
import {
  dateOnly,
  dateTime,
  DOCUMENT_TYPE_LABEL,
  documentTitle,
  STATUS_LABEL,
} from '@/lib/documents';
import { LISTING_STATUS_LABEL, rupees } from '@/lib/listings';
import { canSee, NAV } from '@/lib/roles';
import { RevokeCreditForm } from './revoke-credit-form';
import { StatusActions } from './status-actions';

export const metadata: Metadata = { title: 'User' };

/** Audit actions, in words. */
const ACTION_LABEL: Record<string, string> = {
  'user.account.delete': 'Deleted their account',
  'user.document.upload': 'Uploaded a document',
  'user.document.delete': 'Deleted a document',
  'document.view': 'Viewed their own document',
  'admin.document.view': 'Admin viewed a document',
  'admin.document.approve': 'Admin approved a document',
  'admin.document.reject': 'Admin rejected a document',
  'admin.user.suspend': 'Admin suspended the account',
  'admin.user.ban': 'Admin banned the account',
  'admin.user.reactivate': 'Admin reactivated the account',
  'user.listing.publish': 'Published a listing',
  'user.listing.delete': 'Deleted a listing',
  'admin.listing.approve': 'Admin approved a listing',
  'admin.listing.reject': 'Admin sent a listing back',
  'admin.listing.unpublish': 'Admin unpublished a listing',
  'admin.listing.category': 'Admin moved a listing to another category',
  'admin.credit.revoke': 'Admin took invite credit away',
  'admin.request.remove': 'Admin removed a request',
};

/** Invite credit ledger kinds, in words. */
const CREDIT_KIND_LABEL: Record<string, string> = {
  GRANT_REFEREE: 'Joined with an invite code',
  GRANT_REFERRER: 'A friend finished a first rental',
  HOLD: 'Used on a booking',
  RELEASE: 'Given back (booking cancelled)',
  REVOKE: 'Taken away by an admin',
};

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? 'default' : 'outline'} data-testid={`badge-${label.toLowerCase()}`}>
      {ok ? '✓' : '✗'} {label}
    </Badge>
  );
}

export default async function UserDetailPage({ params }: PageProps<'/users/[id]'>) {
  const { id } = await params;
  const api = await adminApi();
  const [me, detail, referral] = await Promise.all([
    getMe(),
    unwrap(api.GET('/v1/admin/users/{id}', { params: { path: { id } } })).catch((err: unknown) => {
      if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
      throw err;
    }),
    // Invite credit is a bonus: the page still renders without it.
    unwrap(api.GET('/v1/admin/users/{id}/referral', { params: { path: { id } } })).catch(
      () => null,
    ),
  ]);
  const { user, documents, listings, activeSessions, activity } = detail;
  const canReview = canSee(
    NAV.find((i) => i.href === '/documents')!,
    me.role,
  );
  const canModerate = me.role === 'SUPER_ADMIN' || me.role === 'OPS';

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/users" className="text-muted-foreground hover:underline">
          ← Users
        </Link>
      </p>
      <PageHeader
        title={user.name ?? user.phone}
        description={`Joined ${dateOnly.format(new Date(user.createdAt))}`}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Card>
            <CardContent className="flex gap-4 pt-6">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="size-20 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-secondary text-2xl font-semibold">
                  {(user.name ?? '?').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="grid min-w-0 gap-1 text-sm break-words">
                <p className="font-mono">{user.phone}</p>
                <p>{user.email ?? 'No email'}</p>
                <p>{user.city ?? 'No city'}</p>
                {user.bio && <p className="text-muted-foreground">{user.bio}</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  <Check ok={user.phoneVerified} label="Phone" />
                  <Check ok={user.emailVerified} label="Email" />
                  <Check ok={user.idVerified} label="ID" />
                </div>
              </div>
            </CardContent>
          </Card>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Documents</h2>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        No documents.
                      </TableCell>
                    </TableRow>
                  )}
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        {canReview ? (
                          <Link
                            href={`/documents/${doc.id}`}
                            className="text-primary hover:underline"
                          >
                            {documentTitle(doc)}
                          </Link>
                        ) : (
                          documentTitle(doc)
                        )}
                      </TableCell>
                      <TableCell>
                        {STATUS_LABEL[doc.status]}
                        {doc.rejectionReason && (
                          <span className="text-muted-foreground"> · {doc.rejectionReason}</span>
                        )}
                      </TableCell>
                      <TableCell>{dateTime.format(new Date(doc.createdAt))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Listings</h2>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Listing</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        No listings.
                      </TableCell>
                    </TableRow>
                  )}
                  {listings.map((l) => (
                    <TableRow key={l.id} data-testid="user-listing-row">
                      <TableCell>
                        <Link href={`/listings/${l.id}`} className="text-primary hover:underline">
                          {l.title}
                        </Link>
                      </TableCell>
                      <TableCell>{LISTING_STATUS_LABEL[l.status]}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {rupees(l.pricePerDayPaise)}/day
                      </TableCell>
                      <TableCell>{dateOnly.format(new Date(l.createdAt))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>

          {referral && (referral.entries.length > 0 || referral.invited.length > 0) && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Invite credit history</h2>
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>What</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referral.entries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                          No credit yet.
                        </TableCell>
                      </TableRow>
                    )}
                    {referral.entries.map((e) => (
                      <TableRow key={e.id} data-testid="credit-entry">
                        <TableCell className="whitespace-nowrap">
                          {dateTime.format(new Date(e.createdAt))}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono ${e.amountPaise < 0 ? 'text-destructive' : 'text-sj-success'}`}
                        >
                          {e.amountPaise > 0 ? '+' : '−'}
                          {rupees(Math.abs(e.amountPaise))}
                        </TableCell>
                        <TableCell>
                          {CREDIT_KIND_LABEL[e.kind] ?? e.kind}
                          {e.bookingId && (
                            <>
                              {' · '}
                              <Link
                                href={`/bookings/${e.bookingId}`}
                                className="text-primary hover:underline"
                              >
                                booking
                              </Link>
                            </>
                          )}
                          {e.reason && <span className="text-muted-foreground"> · {e.reason}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {referral.invited.length > 0 && (
                <>
                  <h3 className="mt-4 mb-2 font-semibold">People they invited</h3>
                  <ul className="grid gap-1 text-sm">
                    {referral.invited.map((p) => (
                      <li key={p.user.id} data-testid="invited-person">
                        <Link href={`/users/${p.user.id}`} className="text-primary hover:underline">
                          {p.user.name ?? 'New member'}
                        </Link>
                        <span className="text-muted-foreground">
                          {' '}
                          · joined {dateOnly.format(new Date(p.joinedAt))}
                          {p.rewardedAt
                            ? ` · first rental done ${dateOnly.format(new Date(p.rewardedAt))}`
                            : ' · no rental yet'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <section>
            <h2 className="mb-2 text-lg font-semibold">Activity</h2>
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                        Nothing yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {activity.map((a, i) => {
                    const meta = (a.metadata ?? {}) as Record<string, unknown>;
                    return (
                      <TableRow key={i} data-testid="activity-row">
                        <TableCell className="whitespace-nowrap">
                          {dateTime.format(new Date(a.createdAt))}
                        </TableCell>
                        <TableCell>{ACTION_LABEL[a.action] ?? a.action}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {typeof meta.reason === 'string'
                            ? meta.reason
                            : typeof meta.type === 'string'
                              ? (DOCUMENT_TYPE_LABEL[
                                  meta.type as keyof typeof DOCUMENT_TYPE_LABEL
                                ] ?? meta.type)
                              : ''}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Account
                <Badge
                  data-testid="user-status"
                  variant={user.status === 'ACTIVE' ? 'outline' : 'destructive'}
                >
                  {user.status.toLowerCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <p data-testid="active-sessions">
                Signed in on {activeSessions} {activeSessions === 1 ? 'device' : 'devices'}
              </p>
              {canModerate ? (
                <StatusActions id={user.id} status={user.status} />
              ) : (
                <p className="text-muted-foreground">
                  Only Ops and Super Admins can suspend or ban.
                </p>
              )}
            </CardContent>
          </Card>
          {referral && (
            <Card data-testid="invite-credit">
              <CardHeader>
                <CardTitle className="text-title">Invite credit</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <dl className="grid gap-1">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Balance</dt>
                    <dd className="font-mono font-semibold" data-testid="credit-balance">
                      {rupees(referral.creditBalancePaise)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Invite code</dt>
                    <dd className="font-mono">{referral.code ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Invited by</dt>
                    <dd data-testid="referred-by">
                      {referral.referredBy ? (
                        <Link
                          href={`/users/${referral.referredBy.id}`}
                          className="text-primary hover:underline"
                        >
                          {referral.referredBy.name ?? 'Member'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">People invited</dt>
                    <dd data-testid="invited-count">{referral.invited.length}</dd>
                  </div>
                </dl>
                {canModerate && referral.creditBalancePaise > 0 && (
                  <RevokeCreditForm
                    id={user.id}
                    balanceRupees={Math.floor(referral.creditBalancePaise / 100)}
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
