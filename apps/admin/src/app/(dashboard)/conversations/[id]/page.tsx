import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { dateTime } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Conversation' };

/** A read-only chat transcript with what people actually typed. Every view is audited. */
export default async function ConversationPage({
  params,
  searchParams,
}: PageProps<'/conversations/[id]'>) {
  if (!(await adminFor('/reports'))) return <Forbidden />;
  const { id } = await params;
  const query = await searchParams;
  const before = typeof query.before === 'string' ? query.before : undefined;
  const reportId = typeof query.report === 'string' ? query.report : undefined;
  const t = await unwrap(
    (await adminApi()).GET('/v1/admin/conversations/{id}/messages', {
      params: { path: { id }, query: { limit: 50, ...(before ? { before } : {}) } },
    }),
  ).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
    throw err;
  });
  const names: Record<string, string> = {
    [t.borrower.id]: `${t.borrower.name ?? 'Borrower'} (borrower)`,
    [t.lender.id]: `${t.lender.name ?? 'Lender'} (lender)`,
  };
  // Oldest at the top, like a chat.
  const messages = [...t.messages].reverse();

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={reportId ? `/reports/${reportId}` : '/reports'}
          className="text-muted-foreground hover:underline"
        >
          ← {reportId ? 'Report' : 'Reports'}
        </Link>
      </p>
      <PageHeader
        title="Conversation"
        description={`About “${t.listingTitle}” between ${names[t.borrower.id]} and ${names[t.lender.id]}.`}
      />
      <p
        role="note"
        data-testid="logged-banner"
        className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
      >
        This view is logged. Private conversations are for investigating reports only. Text shows
        exactly what people typed, including contact details hidden from the other person.
      </p>
      {t.nextCursor && (
        <Button asChild variant="outline" className="mb-3">
          <Link
            href={`/conversations/${id}?before=${t.nextCursor}${reportId ? `&report=${reportId}` : ''}`}
          >
            Older messages
          </Link>
        </Button>
      )}
      <ol className="grid gap-3" aria-label="Messages">
        {messages.length === 0 && <li className="text-muted-foreground">No messages.</li>}
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid="transcript-message"
            className={cn(
              'max-w-2xl rounded-lg border p-3 text-sm',
              m.senderId === t.lender.id ? 'bg-muted' : 'bg-card',
              m.type === 'SYSTEM' && 'border-dashed text-muted-foreground',
            )}
          >
            <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{names[m.senderId] ?? m.senderId}</span>
              <span>{dateTime.format(new Date(m.createdAt))}</span>
              {m.type !== 'TEXT' && <Badge variant="outline">{m.type.toLowerCase()}</Badge>}
              {m.masked && (
                <Badge variant="destructive">contact details hidden from the other person</Badge>
              )}
            </p>
            {m.body && <p className="whitespace-pre-line">{m.body}</p>}
            {m.offerSummary && <p>{m.offerSummary}</p>}
            {m.imageUrl && (
              <a
                href={m.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                View photo ↗
              </a>
            )}
          </li>
        ))}
      </ol>
    </>
  );
}
