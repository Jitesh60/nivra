import type { Metadata } from 'next';
import Link from 'next/link';
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
import { rupees } from '@/lib/listings';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  REQUEST_TABS,
  type RequestTab,
} from '@/lib/requests';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Requests' };

export default async function RequestsPage({ searchParams }: PageProps<'/requests'>) {
  const params = await searchParams;
  const tab = REQUEST_TABS.includes(params.status as RequestTab)
    ? (params.status as RequestTab)
    : 'OPEN';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;

  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/requests', {
      params: {
        query: {
          limit: 25,
          ...(tab === 'ALL' ? {} : { status: tab }),
          ...(cursor ? { cursor } : {}),
        },
      },
    }),
  );
  const qs = (extra: Record<string, string>) =>
    `/requests?${new URLSearchParams({ status: tab, ...extra })}`;

  return (
    <>
      <PageHeader
        title="Requests"
        description="What borrowers are asking for on the board. Reported requests show a count; Ops can take a request down with a reason the borrower sees."
      />
      <nav aria-label="Request status" className="mb-4 flex flex-wrap gap-2">
        {REQUEST_TABS.map((s) => (
          <Link
            key={s}
            href={`/requests?status=${s}`}
            aria-current={s === tab ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-small font-semibold transition-colors',
              s === tab
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card hover:bg-muted',
            )}
          >
            {REQUEST_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <div className="rounded-lg border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Request</TableHead>
              <TableHead>Borrower</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Answers</TableHead>
              <TableHead>Reports</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {tab === 'ALL'
                    ? 'No requests yet.'
                    : `No ${REQUEST_STATUS_LABEL[tab].toLowerCase()} requests.`}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((r) => (
              <TableRow key={r.id} data-testid="request-row">
                <TableCell className="max-w-80">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {[r.category?.name, r.areaLabel].filter(Boolean).join(' · ')}
                  </p>
                </TableCell>
                <TableCell>{r.borrower.name ?? '—'}</TableCell>
                <TableCell className="font-mono">
                  {r.budgetPerDayPaise == null ? '—' : `${rupees(r.budgetPerDayPaise)}/day`}
                </TableCell>
                <TableCell data-testid="request-answers">{r.responseCount}</TableCell>
                <TableCell>
                  {r.openReports > 0 ? (
                    <Badge variant="destructive" data-testid="request-reports">
                      {r.openReports} open
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {tab === 'ALL' ? (
                    <Badge variant={REQUEST_STATUS_TONE[r.status]} className="mr-2">
                      {REQUEST_STATUS_LABEL[r.status]}
                    </Badge>
                  ) : null}
                  {dateTime.format(new Date(r.createdAt))}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/requests/${r.id}`}>Open</Link>
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
