import { POSTS } from '@/content/blog';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

const escape = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** RSS 2.0 feed of the blog, newest first. */
export function GET() {
  const items = POSTS.map(
    (p) => `    <item>
      <title>${escape(p.title)}</title>
      <link>${SITE_URL}/blog/${p.slug}</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${p.slug}</guid>
      <pubDate>${new Date(`${p.date}T00:00:00+05:30`).toUTCString()}</pubDate>
      <description>${escape(p.description)}</description>
    </item>`,
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Nivra blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Guides to renting and lending on Nivra.</description>
    <language>en-IN</language>
${items}
  </channel>
</rss>
`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
