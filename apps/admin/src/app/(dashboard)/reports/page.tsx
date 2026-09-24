import type { Metadata } from 'next';
import Link from 'next/link';
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
import { adminApi, unwrap } from '@/lib/api';
import { dateTime } from '@/lib/documents';
import {
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_TABS,
  REPORT_TARGET_LABEL,
  type ReportStatus,
} from '@/lib/reports';
import { adminFor } from '@/lib/guard';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ searchParams }: PageProps<'/reports'>) {
  if (!(await adminFor('/reports'))) return <Forbidden />;
  const params = await searchParams;
  const status = REPORT_TABS.includes(params.status as ReportStatus)
    ? (params.status as ReportStatus)
    : 'OPEN';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;
  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/reports', {
      params: { query: { status, limit: 25, ...(cursor ? { cursor } : {}) } },
    }),
  );

  return (
    <>
      <PageHeader
        title="Reports"
        description="People reported by app users: users, listings and chat messages. Open reports are oldest first."
      />
      <nav aria-label="Report status" className="mb-4 flex flex-wrap gap-2">
        {REPORT_TABS.map((s) => (
          <Link
            key={s}
            href={`/reports?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              s === status ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {REPORT_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reported</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>By</TableHead>
              <TableHead>{status === 'OPEN' ? 'Received' : 'Closed'}</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {status === 'OPEN'
                    ? 'No open reports. 🎉'
                    : `No ${REPORT_STATUS_LABEL[status].toLowerCase()} reports.`}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((r) => (
              <TableRow key={r.id} data-testid="report-row">
                <TableCell className="max-w-72">
                  <Badge variant="secondary">{REPORT_TARGET_LABEL[r.target.type]}</Badge>
                  <p className="mt-1 truncate">{r.target.label}</p>
                  {r.openReportsOnTarget > 1 && (
                    <p className="text-xs text-destructive">
                      {r.openReportsOnTarget} open reports about this
                    </p>
                  )}
                </TableCell>
                <TableCell>{REPORT_REASON_LABEL[r.reason] ?? r.reason}</TableCell>
                <TableCell>{r.reporter.name ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {dateTime.format(new Date(r.resolvedAt ?? r.createdAt))}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant={status === 'OPEN' ? 'default' : 'outline'}>
                    <Link href={`/reports/${r.id}`}>{status === 'OPEN' ? 'Review' : 'Open'}</Link>
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
              <Link href={`/reports?status=${status}`}>First page</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline">
              <Link href={`/reports?status=${status}&cursor=${page.nextCursor}`}>Next page</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
