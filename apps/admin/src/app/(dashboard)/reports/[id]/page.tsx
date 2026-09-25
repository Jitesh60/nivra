import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import {
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_TARGET_LABEL,
  targetHref,
  type ReportStatus,
} from '@/lib/reports';
import { MODERATORS } from '@/lib/roles';
import { ResolveForm } from './resolve-form';

export const metadata: Metadata = { title: 'Report' };

export default async function ReportPage({ params }: PageProps<'/reports/[id]'>) {
  const me = await adminFor('/reports');
  if (!me) return <Forbidden />;
  const { id } = await params;
  const r = await unwrap(
    (await adminApi()).GET('/v1/admin/reports/{id}', { params: { path: { id } } }),
  ).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
    throw err;
  });
  const href = targetHref(r);
  const status = r.status as ReportStatus;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/reports?status=${status}`} className="text-muted-foreground hover:underline">
          ← Reports
        </Link>
      </p>
      <PageHeader
        title={`${REPORT_TARGET_LABEL[r.target.type]} reported: ${REPORT_REASON_LABEL[r.reason] ?? r.reason}`}
        description={`Received ${dateTime.format(new Date(r.createdAt))}`}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                What was reported
                <Badge variant="secondary">{REPORT_TARGET_LABEL[r.target.type]}</Badge>
                {r.target.status && <Badge variant="outline">{r.target.status}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {r.target.type === 'MESSAGE' ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">What they typed</p>
                    <blockquote
                      data-testid="original-text"
                      className="mt-1 rounded-md border-l-4 border-destructive bg-muted p-3 whitespace-pre-line"
                    >
                      {r.target.originalText ?? '(no text)'}
                    </blockquote>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">What the other person saw</p>
                    <p className="mt-1">{r.target.label}</p>
                  </div>
                </>
              ) : (
                <p className="font-medium">{r.target.label}</p>
              )}
              <div className="flex flex-wrap gap-3">
                {href && (
                  <Link href={href} className="text-primary hover:underline">
                    {r.target.type === 'LISTING'
                      ? 'Open listing →'
                      : r.target.type === 'REQUEST'
                        ? 'Open request →'
                        : 'Open user →'}
                  </Link>
                )}
                {r.conversationId && (
                  <Link
                    href={`/conversations/${r.conversationId}?report=${r.id}`}
                    className="text-primary hover:underline"
                  >
                    View conversation (logged) →
                  </Link>
                )}
              </div>
              {r.openReportsOnTarget > 1 && (
                <p className="text-destructive">
                  {r.openReportsOnTarget} open reports about the same {r.target.type.toLowerCase()}.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">From the reporter</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                <Link href={`/users/${r.reporter.id}`} className="font-medium hover:underline">
                  {r.reporter.name ?? 'Unnamed user'}
                </Link>{' '}
                {r.reporter.idVerified && <Badge variant="secondary">ID verified</Badge>}
              </p>
              <p>{REPORT_REASON_LABEL[r.reason] ?? r.reason}</p>
              {r.note ? (
                <p className="whitespace-pre-line text-muted-foreground">“{r.note}”</p>
              ) : (
                <p className="text-muted-foreground">No note.</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Status
                <Badge
                  data-testid="report-status"
                  variant={status === 'OPEN' ? 'default' : 'secondary'}
                >
                  {REPORT_STATUS_LABEL[status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            {r.resolvedAt && (
              <CardContent className="grid gap-1 text-sm">
                <p>Closed {dateTime.format(new Date(r.resolvedAt))}</p>
                {r.resolutionNote && <p className="whitespace-pre-line">{r.resolutionNote}</p>}
              </CardContent>
            )}
          </Card>
          {status === 'OPEN' &&
            (MODERATORS.includes(me.role) ? (
              <ResolveForm id={r.id} />
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="cannot-resolve">
                Only Ops and Super Admins can close reports.
              </p>
            ))}
        </div>
      </div>
    </>
  );
}
