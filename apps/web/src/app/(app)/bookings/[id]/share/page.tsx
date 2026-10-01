import { Button, PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ShareForm } from '@/components/bookings/share-form';
import { getBooking, getDocuments, USER_DOC_LABEL } from '@/lib/bookings';
import { DOC_LABEL } from '@/lib/format';
import { shareDocumentsAction } from '../../actions';

export const metadata: Metadata = { title: 'Share documents' };

export default async function SharePage({ params }: PageProps<'/bookings/[id]/share'>) {
  const { id } = await params;
  const [booking, docs] = await Promise.all([getBooking(id), getDocuments()]);
  if (!booking) notFound();
  if (!booking.can.shareDocs) redirect(`/bookings/${id}`);

  const usable = docs.filter((d) => d.status !== 'REJECTED');
  const required = booking.requiredDocs.map((r) => ({
    id: r.id,
    label: r.note ?? DOC_LABEL[r.docType],
    options: usable
      // An empty list means any document will do.
      .filter((d) => r.accepts.length === 0 || (r.accepts as string[]).includes(d.type))
      .map((d) => ({
        id: d.id,
        label: `${d.label ?? USER_DOC_LABEL[d.type]}${d.status === 'APPROVED' ? ' · checked by Nivra' : ''}`,
      })),
  }));
  const missing = required.filter((r) => r.options.length === 0);

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader
        title="Share documents"
        description={`${booking.other.name ?? 'The lender'} asked to see these before renting out ${booking.listing.title}.`}
      />
      {missing.length > 0 && (
        <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
          <p className="text-small">
            Add {missing.map((m) => m.label).join(', ')} to your documents first.
          </p>
          <div>
            <Button asChild variant="secondary">
              <Link href={`/documents?next=/bookings/${id}/share`}>Add a document</Link>
            </Button>
          </div>
        </section>
      )}
      <ShareForm required={required} share={shareDocumentsAction.bind(null, id)} />
      <p className="text-caption text-sj-muted-foreground">
        The lender sees them only for this booking, with your name watermarked, and every view is
        logged. Access ends when the rental does.
      </p>
    </div>
  );
}
