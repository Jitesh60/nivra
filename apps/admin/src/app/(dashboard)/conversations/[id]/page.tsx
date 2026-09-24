import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { TranscriptList, transcriptNames } from '@/components/dashboard/transcript';
import { Button } from '@/components/ui/button';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { adminFor } from '@/lib/guard';

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
  const bookingId = typeof query.booking === 'string' ? query.booking : undefined;
  const disputeId = typeof query.dispute === 'string' ? query.dispute : undefined;
  const t = await unwrap(
    (await adminApi()).GET('/v1/admin/conversations/{id}/messages', {
      params: { path: { id }, query: { limit: 50, ...(before ? { before } : {}) } },
    }),
  ).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
    throw err;
  });
  const names = transcriptNames(t);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href={
            disputeId
              ? `/disputes/${disputeId}`
              : bookingId
                ? `/bookings/${bookingId}`
                : reportId
                  ? `/reports/${reportId}`
                  : '/reports'
          }
          className="text-muted-foreground hover:underline"
        >
          ← {disputeId ? 'Dispute' : bookingId ? 'Booking' : reportId ? 'Report' : 'Reports'}
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
            href={`/conversations/${id}?before=${t.nextCursor}${reportId ? `&report=${reportId}` : ''}${bookingId ? `&booking=${bookingId}` : ''}${disputeId ? `&dispute=${disputeId}` : ''}`}
          >
            Older messages
          </Link>
        </Button>
      )}
      <TranscriptList t={t} />
    </>
  );
}
