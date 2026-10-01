import { CalendarCheck, Compass, Heart, Package, User } from 'lucide-react';

/** Main sections of the signed-in web app (top bar on desktop, bottom bar on phones). */
export const APP_NAV = [
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/bookings', label: 'Bookings', icon: CalendarCheck },
  { href: '/listings', label: 'Lend', icon: Package },
  { href: '/profile', label: 'Profile', icon: User },
] as const;

/** Links in the account menu. */
export const ACCOUNT_MENU = [
  { href: '/profile', label: 'Profile' },
  { href: '/wishlist', label: 'Wishlist' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/listings', label: 'My listings' },
  { href: '/documents', label: 'Documents' },
  { href: '/earnings', label: 'Earnings' },
] as const;

export const BROWSE_LINK = { href: '/explore', label: 'Explore', icon: Compass } as const;
