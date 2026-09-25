import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Prose } from '@/components/site/legal';
import { PageShell } from '@/components/site/section';
import { type Block, POSTS, postBySlug, postDate } from '@/content/blog';
import { SITE_URL } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const post = postBySlug((await params).slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      publishedTime: post.date,
    },
  };
}

function render(block: Block, i: number) {
  if ('h2' in block) return <h2 key={i}>{block.h2}</h2>;
  if ('ul' in block) {
    return (
      <ul key={i}>
        {block.ul.map((li) => (
          <li key={li}>{li}</li>
        ))}
      </ul>
    );
  }
  if ('tip' in block) {
    return (
      <p key={i} className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-brand-900">
        <strong>Tip:</strong> {block.tip}
      </p>
    );
  }
  return <p key={i}>{block.p}</p>;
}

export default async function PostPage({ params }: PageProps<'/blog/[slug]'>) {
  const post = postBySlug((await params).slug);
  if (!post) notFound();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: 'Nivra', url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };
  return (
    <PageShell title={post.title} intro={`${postDate(post)} · ${post.minutes} min read`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <article>
        <Prose>
          {post.body.map(render)}
          <p className="mt-10 border-t border-ink-200 pt-6">
            <Link href="/blog" className="font-semibold text-brand-700">
              ← More from the blog
            </Link>
          </p>
        </Prose>
      </article>
    </PageShell>
  );
}
