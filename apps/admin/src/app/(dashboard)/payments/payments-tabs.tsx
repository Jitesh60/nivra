'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/payments', label: 'Payments' },
  { href: '/payments/payouts', label: 'Payouts' },
  { href: '/payments/ledger', label: 'Ledger' },
];

/** Payments · Payouts · Ledger. */
export function PaymentsTabs() {
  const pathname = usePathname();
  const current =
    TABS.slice(1).find((t) => pathname.startsWith(t.href))?.href ??
    (pathname.startsWith('/payments') ? '/payments' : '');
  return (
    <nav aria-label="Finance" className="mb-6 flex gap-1 border-b">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === current ? 'page' : undefined}
          className={cn(
            '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
            t.href === current
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
