import {
  Bell,
  CalendarCheck,
  Compass,
  FileText,
  Gift,
  Heart,
  Megaphone,
  MessagesSquare,
  Package,
  Search,
  Settings,
  Wallet,
} from 'lucide-react';

type Icon = typeof Compass;
export type BadgeKey = 'conversations' | 'notifications';

export interface DockItem {
  href: string;
  label: string;
  icon: Icon;
  badgeKey?: BadgeKey;
  /** Path prefixes this item stays highlighted on. */
  match: readonly string[];
  /** Prefixes that belong to another item even though they share a prefix. */
  except?: readonly string[];
}

/**
 * The bottom dock of the signed-in web app (every screen size). Kept to five
 * so it stays easy to read. One account borrows and lends: "Borrow" and
 * "Lend" sit side by side.
 */
export const DOCK: readonly DockItem[] = [
  {
    href: '/explore',
    label: 'Borrow',
    icon: Compass,
    match: ['/explore', '/item', '/wishlist', '/requests', '/saved-searches', '/u/'],
  },
  {
    href: '/listings',
    label: 'Lend',
    icon: Package,
    match: ['/listings', '/earnings'],
  },
  {
    href: '/inbox',
    label: 'Inbox',
    icon: MessagesSquare,
    badgeKey: 'conversations',
    match: ['/inbox'],
  },
  { href: '/bookings', label: 'Bookings', icon: CalendarCheck, match: ['/bookings'] },
];

export function isActive(pathname: string, item: Pick<DockItem, 'match' | 'except'>): boolean {
  const hit = (p: string) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`);
  if (item.except?.some(hit)) return false;
  return item.match.some(hit);
}

export interface MeLink {
  href: string;
  label: string;
  icon: Icon;
  badgeKey?: BadgeKey;
}

/**
 * The "Me" sheet: one short list of everything not already in the dock,
 * most used first.
 */
export const ME_LINKS: readonly MeLink[] = [
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/earnings', label: 'Earnings', icon: Wallet },
  { href: '/notifications', label: 'Notifications', icon: Bell, badgeKey: 'notifications' },
  { href: '/documents', label: 'My documents', icon: FileText },
  { href: '/requests', label: 'Requests board', icon: Megaphone },
  { href: '/saved-searches', label: 'Saved searches', icon: Search },
  { href: '/invite', label: 'Invite friends', icon: Gift },
  { href: '/settings', label: 'Settings', icon: Settings },
];

/** Links in the marketing header's account menu. */
export const ACCOUNT_MENU = [
  { href: '/explore', label: 'Borrow: browse items' },
  { href: '/listings', label: 'Lend: my listings' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/inbox', label: 'Inbox' },
  { href: '/profile', label: 'Profile' },
  { href: '/settings', label: 'Settings' },
] as const;
