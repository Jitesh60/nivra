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
import { canSee, NAV } from '@/lib/roles';
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
  const [me, detail] = await Promise.all([
    getMe(),
    unwrap((await adminApi()).GET('/v1/admin/users/{id}', { params: { path: { id } } })).catch(
      (err: unknown) => {
        if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
        throw err;
      },
    ),
  ]);
  const { user, documents, activeSessions, activity } = detail;
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
        </div>
      </div>
    </>
  );
}
