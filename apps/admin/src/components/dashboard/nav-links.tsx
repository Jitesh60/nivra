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

/**
 * Sidebar links: Lucide icons, the active page as a primary-soft pill.
 * [collapsed] shows icons only (the name stays as the accessible name and a
 * tooltip); [onNavigate] lets the phone menu close after a tap.
 */
export function NavLinks({
  items,
  collapsed = false,
  onNavigate,
}: {
  items: { href: string; label: string }[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {items.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        const Icon = ICONS[item.href] ?? LayoutDashboard;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              'flex h-10 shrink-0 items-center gap-3 rounded-full text-small font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-200',
              'outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
              collapsed ? 'size-10 justify-center self-center px-0' : 'px-3.5',
              active &&
                'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon aria-hidden className="size-5 shrink-0" />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </nav>
  );
}
