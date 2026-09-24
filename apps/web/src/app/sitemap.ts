import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ['', '/how-it-works', '/lend', '/faq', '/contact', '/privacy', '/terms'];
  return pages.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: 'monthly',
    priority: path === '' ? 1 : path === '/privacy' || path === '/terms' ? 0.3 : 0.7,
  }));
}
