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
import {
  dateTime,
  DOCUMENT_STATUSES,
  documentTitle,
  STATUS_LABEL,
  type DocumentStatus,
} from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Documents' };

export default async function DocumentsPage({ searchParams }: PageProps<'/documents'>) {
  if (!(await adminFor('/documents'))) return <Forbidden />;

  const params = await searchParams;
  const status = DOCUMENT_STATUSES.includes(params.status as DocumentStatus)
    ? (params.status as DocumentStatus)
    : 'PENDING';
  const cursor = typeof params.cursor === 'string' ? params.cursor : undefined;

  const page = await unwrap(
    (await adminApi()).GET('/v1/admin/documents', {
      params: { query: { status, limit: 25, ...(cursor ? { cursor } : {}) } },
    }),
  );

  return (
    <>
      <PageHeader
        title="Documents"
        description="ID documents waiting for review. Oldest first, so nobody waits too long."
      />
      <nav aria-label="Document status" className="mb-4 flex gap-2">
        {DOCUMENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/documents?status=${s}`}
            aria-current={s === status ? 'page' : undefined}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm',
              s === status ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
            )}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>{status === 'PENDING' ? 'Status' : 'Reviewed'}</TableHead>
              <TableHead className="sr-only">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {status === 'PENDING'
                    ? 'Nothing to review. 🎉'
                    : `No ${STATUS_LABEL[status].toLowerCase()} documents.`}
                </TableCell>
              </TableRow>
            )}
            {page.items.map((doc) => (
              <TableRow key={doc.id} data-testid="document-row">
                <TableCell className="font-medium">
                  {documentTitle(doc)}
                  {doc.hasBack && (
                    <span className="ml-2 text-xs text-muted-foreground">front + back</span>
                  )}
                </TableCell>
                <TableCell>
                  <p>{doc.user.name ?? '—'}</p>
                  <p className="font-mono text-xs text-muted-foreground">{doc.user.phone}</p>
                </TableCell>
                <TableCell>{dateTime.format(new Date(doc.createdAt))}</TableCell>
                <TableCell>
                  {doc.status === 'PENDING' ? (
                    <Badge variant="secondary">Pending</Badge>
                  ) : (
                    <span className="text-sm">
                      {doc.reviewedAt && dateTime.format(new Date(doc.reviewedAt))}
                      {doc.reviewedBy && (
                        <span className="text-muted-foreground"> · {doc.reviewedBy}</span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    asChild
                    size="sm"
                    variant={doc.status === 'PENDING' ? 'default' : 'outline'}
                  >
                    <Link href={`/documents/${doc.id}`}>
                      {doc.status === 'PENDING' ? 'Review' : 'Open'}
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
              <Link href={`/documents?status=${status}`}>First page</Link>
            </Button>
          )}
          {page.nextCursor && (
            <Button asChild variant="outline">
              <Link href={`/documents?status=${status}&cursor=${page.nextCursor}`}>Next page</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
