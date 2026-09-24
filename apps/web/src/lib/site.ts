export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3002').replace(
  /\/$/,
  '',
);
export const API_URL = (process.env.NEXT_PUBLIC_SAJHA_API_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
export const CONTACT_EMAIL = 'hello@sajha.app';

export const NAV = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/lend', label: 'Lend' },
  { href: '/faq', label: 'FAQ' },
] as const;
