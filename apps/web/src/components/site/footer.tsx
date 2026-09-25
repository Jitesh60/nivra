import { Logo } from '@sajha/ui';
import Link from 'next/link';
import { RENT_PAGES } from '@/content/rent-pages';
import { CONTACT_EMAIL, NAV } from '@/lib/site';

export function Footer() {
  return (
    <footer className="bg-ink-950 px-4 text-ink-300">
      <div className="mx-auto grid max-w-6xl gap-8 py-12 sm:grid-cols-4">
        <div>
          <Logo inverse tagline />
          <p className="mt-2 text-sm">Borrow what you need. Lend what you don’t use.</p>
        </div>
        <nav aria-label="Footer" className="grid gap-2 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-white">
              {item.label}
            </Link>
          ))}
          <Link href="/contact" className="hover:text-white">
            Contact
          </Link>
        </nav>
        <nav aria-label="Rent in Pune" className="grid content-start gap-2 text-sm">
          {RENT_PAGES.map((p) => (
            <Link key={p.slug} href={`/rent/${p.slug}`} className="hover:text-white">
              {p.name}
            </Link>
          ))}
        </nav>
        <div className="grid content-start gap-2 text-sm">
          <Link href="/terms" className="hover:text-white">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy Policy
          </Link>
          <Link href="/delete-account" className="hover:text-white">
            Delete your account
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>
      <p className="border-t border-white/10 py-4 text-center text-xs text-ink-400">
        © {new Date().getFullYear()} Nivra. Made in India.
      </p>
    </footer>
  );
}
