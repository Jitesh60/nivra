import { Badge, PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AddDocumentForm, DeleteDocument } from '@/components/bookings/document-forms';
import { getDocuments, USER_DOC_LABEL } from '@/lib/bookings';
import { shortDate } from '@/lib/format';
import { safeNext } from '@/lib/safe-next';
import { addDocumentAction, deleteDocumentAction } from './actions';

export const metadata: Metadata = { title: 'Documents' };

const STATUS = {
  PENDING: { label: 'Being checked', tone: 'info' },
  APPROVED: { label: 'Verified', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
} as const;

export default async function DocumentsPage({ searchParams }: PageProps<'/documents'>) {
  const [docs, sp] = await Promise.all([getDocuments(), searchParams]);
  const next = typeof sp.next === 'string' ? safeNext(sp.next) : null;
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader
        title="Documents"
        description="Your ID, kept private. You choose what to share, booking by booking."
      />
      {next && (
        <Link
          href={next}
          className="text-small font-semibold text-sj-primary underline-offset-4 hover:underline"
        >
          ← Back to your booking
        </Link>
      )}
      {docs.length > 0 && (
        <ul className="grid gap-3">
          {docs.map((d) => (
            <li
              key={d.id}
              className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-4 sm:grid-cols-[120px_1fr]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- streamed private image */}
              <img
                src={`/documents/${d.id}/image?side=front`}
                alt={`${USER_DOC_LABEL[d.type]} front`}
                className="aspect-[3/2] w-full rounded-md bg-sj-surface-muted object-cover"
              />
              <div className="grid content-start gap-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {d.label ?? USER_DOC_LABEL[d.type]}
                  <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                </p>
                <p className="text-caption text-sj-muted-foreground">
                  Added {shortDate(d.createdAt)}
                  {d.expiresOn && ` · expires ${shortDate(d.expiresOn)}`}
                  {d.hasBack && ' · front and back'}
                </p>
                {d.rejectionReason && (
                  <p className="text-small text-sj-danger">{d.rejectionReason}</p>
                )}
                <DeleteDocument remove={deleteDocumentAction.bind(null, d.id)} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-5">
        <h2 className="text-h3">Add a document</h2>
        <AddDocumentForm add={addDocumentAction} />
      </section>
    </div>
  );
}
