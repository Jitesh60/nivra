import { ImageResponse } from 'next/og';
import { POSTS, postBySlug } from '@/content/blog';

export const alt = 'A post on the Nivra blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export default async function PostImage({ params }: { params: Promise<{ slug: string }> }) {
  const post = postBySlug((await params).slug);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        color: 'white',
        background:
          'radial-gradient(circle at 15% 20%, #11846A, transparent 55%), radial-gradient(circle at 90% 90%, #D95806, transparent 45%), #062722',
      }}
    >
      <div style={{ fontSize: 32, opacity: 0.85 }}>Nivra · Blog</div>
      <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.15 }}>
        {post?.title ?? 'The Nivra blog'}
      </div>
      <div style={{ fontSize: 28, color: '#FDD38A' }}>
        {post ? `${post.minutes} min read` : 'sajha.app'}
      </div>
    </div>,
    size,
  );
}
