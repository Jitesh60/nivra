import type { AdminRole } from './api';

export const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  OPS: 'Ops',
  SUPPORT: 'Support',
};

export interface NavItem {
  href: string;
  label: string;
  /** Roles that can see it; omitted = everyone. Mirrors the API's @Roles. */
  roles?: AdminRole[];
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Overview' },
  { href: '/users', label: 'Users' },
  { href: '/listings', label: 'Listings' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/payments', label: 'Payments' },
  { href: '/disputes', label: 'Disputes' },
  { href: '/reports', label: 'Reports' },
  { href: '/documents', label: 'Documents', roles: ['SUPER_ADMIN', 'OPS'] },
  { href: '/categories', label: 'Categories', roles: ['SUPER_ADMIN', 'OPS'] },
  { href: '/waitlist', label: 'Waitlist', roles: ['SUPER_ADMIN', 'OPS'] },
  { href: '/admins', label: 'Admins', roles: ['SUPER_ADMIN'] },
  { href: '/account', label: 'My account' },
];

/** Roles that can moderate listings, close reports, cancel bookings, refund and settle disputes (mirrors the API). */
export const MODERATORS: AdminRole[] = ['SUPER_ADMIN', 'OPS'];

export function canSee(item: { roles?: AdminRole[] }, role: AdminRole): boolean {
  return !item.roles || item.roles.includes(role);
}
