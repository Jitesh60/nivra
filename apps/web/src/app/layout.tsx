import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
import { SITE_URL } from '@/lib/site';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  display: 'swap',
});
const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  display: 'swap',
});

const description =
  'Nivra is a peer-to-peer rental marketplace in India. Rent trekking gear, cameras, tools and more from people near you, or earn from things you rarely use.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Nivra: borrow what you need, lend what you don’t use',
    template: '%s · Nivra',
  },
  description,
  applicationName: 'Nivra',
  keywords: [
    'rent',
    'rental marketplace',
    'borrow',
    'lend',
    'India',
    'trekking gear',
    'camera rental',
    'tools',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Nivra',
    locale: 'en_IN',
    title: 'Nivra: borrow what you need, lend what you don’t use',
    description,
  },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = { themeColor: '#062722' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-IN" className={`${jakarta.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
