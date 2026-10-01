import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/app-shell';
import { getMe } from '@/lib/api';

export const metadata: Metadata = { robots: { index: false } };

/** Every signed-in page. New accounts finish setup (name) first. */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const me = await getMe();
  if (!me.name) redirect('/welcome');
  return <AppShell me={me}>{children}</AppShell>;
}
