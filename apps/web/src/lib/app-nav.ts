import { Compass, Heart, User } from 'lucide-react';

/** Main sections of the signed-in web app (top bar on desktop, bottom bar on phones). */
export const APP_NAV = [
  { href: '/wishlist', label: 'Wishlist', icon: Heart },
  { href: '/profile', label: 'Profile', icon: User },
] as const;

/** Links in the account menu. */
export const ACCOUNT_MENU = [
  { href: '/profile', label: 'Profile' },
  { href: '/wishlist', label: 'Wishlist' },
] as const;

export const BROWSE_LINK = { href: '/explore', label: 'Explore', icon: Compass } as const;
