import { Logo } from '@sajha/ui';
import Link from 'next/link';
import { GlowLink } from '@/components/ui/glow-button';
import { NAV } from '@/lib/site';
import { cn } from '@/lib/utils';

/** Transparent over the dark hero on the home page, solid elsewhere. */
export function Header({ overlay = false }: { overlay?: boolean }) {
  return (
    <header
      className={cn(
        'z-20 w-full px-4',
        overlay
          ? 'absolute inset-x-0 top-0 text-white'
          : 'border-b border-ink-100 bg-white/90 text-ink-900 backdrop-blur',
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 py-4">
        <Link href="/" aria-label="Home" className="rounded-md">
          <Logo inverse={overlay} />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm font-medium sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="opacity-85 transition-opacity hover:opacity-100"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <GlowLink href="/#waitlist" variant={overlay ? 'primary' : 'brand'} size="sm">
          Join the waitlist
        </GlowLink>
      </div>
    </header>
  );
}
