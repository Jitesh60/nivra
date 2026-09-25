'use client';

import {
  ArrowLeftRight,
  CalendarCheck,
  CircleUser,
  ClipboardList,
  FileCheck,
  Flag,
  FolderTree,
  HandHelping,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ICONS: Record<string, LucideIcon> = {
  '/': LayoutDashboard,
  '/users': Users,
  '/listings': Package,
  '/bookings': CalendarCheck,
  '/payments': ArrowLeftRight,
  '/disputes': Scale,
  '/reports': Flag,
  '/requests': HandHelping,
  '/documents': FileCheck,
  '/categories': FolderTree,
  '/waitlist': ClipboardList,
  '/admins': ShieldCheck,
  '/account': CircleUser,
};

/** Sidebar links: Lucide icons, the active page as a primary-soft pill. */
export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0"
      aria-label="Main"
    >
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = ICONS[item.href] ?? LayoutDashboard;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex h-10 shrink-0 items-center gap-3 rounded-full px-3.5 text-small font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-200',
              'outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              active &&
                'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon aria-hidden className="size-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
