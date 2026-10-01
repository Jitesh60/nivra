import { EmptyState, PageHeader } from '@sajha/ui';
import { Star } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Avatar } from '@/components/app/avatar';
import { Stars } from '@/components/browse/stars';
import { publicApi } from '@/lib/api';
import { shortDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Reviews', robots: { index: false } };

/** What borrowers and lenders said about a member (linked from listings). */
export default async function MemberReviewsPage({ params }: PageProps<'/u/[id]'>) {
  const { id } = await params;
  const { data } = await (
    await publicApi()
  ).GET('/v1/users/{id}/reviews', {
    params: { path: { id }, query: { limit: 30 } },
  });
  if (!data) notFound();
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader
        title="Reviews"
        description={
          data.ratingAvg && data.ratingCount
            ? `${data.ratingAvg.toFixed(1)} out of 5 from ${data.ratingCount} ${data.ratingCount === 1 ? 'review' : 'reviews'}`
            : 'No reviews yet.'
        }
      />
      {data.items.length === 0 ? (
        <EmptyState
          icon={<Star />}
          title="No reviews yet"
          description="Reviews appear after completed rentals."
        />
      ) : (
        <ul className="grid gap-4">
          {data.items.map((r) => (
            <li
              key={r.id}
              className="flex gap-3 rounded-lg border border-sj-border bg-sj-surface p-4"
            >
              <Avatar name={r.authorName} url={r.authorAvatarUrl} size={40} />
              <div className="grid min-w-0 gap-1">
                <p className="flex flex-wrap items-center gap-2 text-small font-semibold">
                  {r.authorName ?? 'Nivra user'} <Stars rating={r.rating} size={14} />
                  <span className="font-normal text-sj-muted-foreground">
                    {r.authorRole === 'BORROWER' ? 'rented' : 'lent'} {r.listingTitle} ·{' '}
                    {shortDate(r.publishedAt)}
                  </span>
                </p>
                {r.comment && <p className="text-small">{r.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
