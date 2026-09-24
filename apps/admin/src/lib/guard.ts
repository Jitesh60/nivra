import 'server-only';
import { getMe, type Admin } from './api';
import { canSee, NAV } from './roles';

/** The signed-in admin if their role can open the nav section [href], else null. */
export async function adminFor(href: string): Promise<Admin | null> {
  const me = await getMe();
  const item = NAV.find((i) => i.href === href);
  return item && canSee(item, me.role) ? me : null;
}
