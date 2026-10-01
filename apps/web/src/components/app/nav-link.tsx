'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { BadgeKey } from '@/lib/app-nav';
import { cn } from '@/lib/utils';
import { useUnread } from './unread';

/** A top-bar link that highlights itself on its section's pages. */
export function NavLink({
  href,
  label,
  icon,
  badgeKey,
  ariaLabel,
  className,
}: {
  href: string;
  label: string;
  /** For icon-only links (no visible label). */
  ariaLabel?: string;
  icon: React.ReactNode;
  badgeKey?: BadgeKey;
  className?: string;
}) {
  const pathname = usePathname();
  const badge = useUnread(badgeKey);
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const count = badge && badge > 0 ? (badge > 99 ? '99+' : String(badge)) : null;
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={ariaLabel}
      className={cn(
        'relative flex items-center gap-2 rounded-full px-3 py-2 text-small font-semibold transition-colors [&_svg]:size-5',
        active
          ? 'bg-sj-primary-soft text-sj-on-primary-soft'
          : 'text-sj-muted-foreground hover:bg-sj-surface-muted hover:text-sj-foreground',
        className,
      )}
    >
      <span className="relative">
        {icon}
        {count && (
          <span
            data-testid={`badge-${badgeKey}`}
            className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-sj-accent px-1 text-center text-[10px] leading-4 font-bold text-sj-on-accent"
          >
            {count}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}
