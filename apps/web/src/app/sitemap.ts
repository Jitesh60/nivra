import type { MetadataRoute } from 'next';
import { POSTS } from '@/content/blog';
import { RENT_PAGES } from '@/content/rent-pages';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    '',
    '/how-it-works',
    '/lend',
    '/faq',
    '/blog',
    '/contact',
    '/privacy',
    '/terms',
    '/delete-account',
  ];
  const legal = new Set(['/privacy', '/terms', '/delete-account']);
  return [
    ...pages.map((path) => ({
      url: `${SITE_URL}${path}`,
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : legal.has(path) ? 0.3 : 0.7,
    })),
    ...RENT_PAGES.map((p) => ({
      url: `${SITE_URL}/rent/${p.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...POSTS.map((p) => ({
      url: `${SITE_URL}/blog/${p.slug}`,
      lastModified: p.date,
      changeFrequency: 'yearly' as const,
      priority: 0.6,
    })),
  ];
}
