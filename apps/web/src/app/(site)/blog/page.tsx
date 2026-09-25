import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/site/section';
import { POSTS, postDate } from '@/content/blog';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Guides to renting and lending on Nivra: pricing, safety, deposits and more.',
  alternates: { canonical: '/blog', types: { 'application/rss+xml': '/blog/rss.xml' } },
};

export default function BlogPage() {
  return (
    <PageShell title="Blog" intro="Guides to borrowing and lending well, from the Nivra team.">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-3">
        {POSTS.map((p) => (
          <article
            key={p.slug}
            className="flex flex-col rounded-2xl border border-ink-200 p-6"
            data-testid="post-card"
          >
            <p className="text-sm text-ink-500">
              {postDate(p)} · {p.minutes} min read
            </p>
            <h2 className="mt-2 font-display text-xl font-bold text-ink-950">
              <Link href={`/blog/${p.slug}`} className="hover:underline">
                {p.title}
              </Link>
            </h2>
            <p className="mt-3 flex-1 text-ink-600">{p.description}</p>
            <Link href={`/blog/${p.slug}`} className="mt-4 font-semibold text-brand-700">
              Read more →
            </Link>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
