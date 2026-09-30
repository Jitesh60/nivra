'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** A nav item that highlights itself on its section's pages. */
export function NavLink({
  href,
  label,
  icon,
  compact = false,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  compact?: boolean;
  badge?: number;
}) {
  const pathname = usePathname();
  const active =
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const count = badge && badge > 0 ? (badge > 99 ? '99+' : String(badge)) : null;
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative transition-colors [&_svg]:size-5',
        compact
          ? 'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold'
          : 'flex items-center gap-2 rounded-full px-3 py-2 text-small font-semibold',
        active
          ? compact
            ? 'text-sj-primary'
            : 'bg-sj-primary-soft text-sj-on-primary-soft'
          : 'text-sj-muted-foreground hover:text-sj-foreground',
      )}
    >
      <span className="relative">
        {icon}
        {count && (
          <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-sj-accent px-1 text-center text-[10px] leading-4 font-bold text-sj-on-accent">
            {count}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}
