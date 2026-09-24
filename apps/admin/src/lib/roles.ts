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
  { href: '/waitlist', label: 'Waitlist', roles: ['SUPER_ADMIN', 'OPS'] },
  { href: '/admins', label: 'Admins', roles: ['SUPER_ADMIN'] },
  { href: '/account', label: 'My account' },
];

export function canSee(item: { roles?: AdminRole[] }, role: AdminRole): boolean {
  return !item.roles || item.roles.includes(role);
}
