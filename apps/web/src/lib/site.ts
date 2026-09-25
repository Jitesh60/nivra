export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002').replace(
  /\/$/,
  '',
);
export const API_URL = (process.env.NEXT_PUBLIC_SAJHA_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
export const CONTACT_EMAIL = 'hello@sajha.app';

/**
 * Store pages. Set them at launch (build-time env) and the site swaps the
 * waitlist for download buttons; until then the waitlist stays.
 */
export const STORE_LINKS = {
  play: process.env.NEXT_PUBLIC_PLAY_STORE_URL || null,
  appStore: process.env.NEXT_PUBLIC_APP_STORE_URL || null,
};

export const NAV = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/lend', label: 'Lend' },
  { href: '/faq', label: 'FAQ' },
  { href: '/blog', label: 'Blog' },
] as const;
