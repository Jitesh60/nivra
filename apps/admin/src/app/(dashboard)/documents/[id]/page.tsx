import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Forbidden } from '@/components/dashboard/forbidden';
import { PageHeader } from '@/components/dashboard/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminApi, ApiRequestError, unwrap } from '@/lib/api';
import { dateOnly, dateTime, documentTitle, STATUS_LABEL } from '@/lib/documents';
import { adminFor } from '@/lib/guard';
import { ReviewActions } from './review-actions';

export const metadata: Metadata = { title: 'Review document' };

export default async function ReviewDocumentPage({ params }: PageProps<'/documents/[id]'>) {
  const me = await adminFor('/documents');
  if (!me) return <Forbidden />;

  const { id } = await params;
  const doc = await unwrap(
    (await adminApi()).GET('/v1/admin/documents/{id}', { params: { path: { id } } }),
  ).catch((err: unknown) => {
    if (err instanceof ApiRequestError && err.error.code === 'NOT_FOUND') notFound();
    throw err;
  });

  const sides = doc.hasBack ? (['front', 'back'] as const) : (['front'] as const);
  const viewedAt = dateTime.format(new Date());
  const expired = doc.expiresOn && new Date(doc.expiresOn) < new Date(new Date().toDateString());

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/documents" className="text-muted-foreground hover:underline">
          ← Documents
        </Link>
      </p>
      <PageHeader
        title={documentTitle(doc)}
        description="Check the photo is clear, the document is genuine, and the name matches the profile."
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid content-start gap-4">
          {sides.map((side) => (
            <figure key={side} className="rounded-lg border bg-card p-3">
              <figcaption className="mb-2 text-sm font-medium capitalize">{side}</figcaption>
              <div className="relative overflow-hidden rounded-md bg-muted select-none">
                {/* Streams through /image (no-store); next/image would cache it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/documents/${doc.id}/image?side=${side}`}
                  alt={`${documentTitle(doc)}, ${side} side`}
                  className="max-h-[70vh] w-full object-contain"
                  draggable={false}
                  data-testid={`document-image-${side}`}
                />
                <div
                  aria-hidden
                  data-testid="watermark"
                  className="pointer-events-none absolute inset-0 flex flex-wrap content-around justify-around overflow-hidden p-4 text-sm font-semibold text-black/25 [text-shadow:0_0_2px_rgb(255_255_255/0.6)]"
                >
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} className="-rotate-[20deg] whitespace-nowrap">
                      Viewed by {me.name} · {viewedAt}
                    </span>
                  ))}
                </div>
              </div>
            </figure>
          ))}
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Status
                <Badge
                  data-testid="document-status"
                  variant={
                    doc.status === 'REJECTED'
                      ? 'destructive'
                      : doc.status === 'APPROVED'
                        ? 'default'
                        : 'secondary'
                  }
                >
                  {STATUS_LABEL[doc.status]}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>Submitted {dateTime.format(new Date(doc.createdAt))}</p>
              {doc.expiresOn && (
                <p className={expired ? 'text-destructive' : undefined}>
                  {expired ? 'Expired' : 'Valid until'} {dateOnly.format(new Date(doc.expiresOn))}
                </p>
              )}
              {doc.reviewedAt && (
                <p>
                  Reviewed {dateTime.format(new Date(doc.reviewedAt))}
                  {doc.reviewedBy && ` by ${doc.reviewedBy}`}
                </p>
              )}
              {doc.rejectionReason && (
                <p className="text-destructive">Reason: {doc.rejectionReason}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">User</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p className="font-medium">{doc.user.name ?? '—'}</p>
              <p className="font-mono text-xs">{doc.user.phone}</p>
              <p>{doc.user.email ?? '—'}</p>
              <Link href={`/users/${doc.user.id}`} className="mt-1 text-primary hover:underline">
                Open user →
              </Link>
            </CardContent>
          </Card>

          {doc.status === 'PENDING' && <ReviewActions id={doc.id} />}
          <p className="text-xs text-muted-foreground">
            Every time these images load, the view is written to the audit log under your name.
          </p>
        </div>
      </div>
    </>
  );
}
