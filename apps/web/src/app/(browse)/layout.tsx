import { AppShell } from '@/components/app/app-shell';
import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';
import { getMeOrNull } from '@/lib/api';

/**
 * Browsing is open to everyone: guests get the site header and footer,
 * signed-in users the app shell, so they keep their navigation.
 */
export default async function BrowseLayout({ children }: LayoutProps<'/'>) {
  const me = await getMeOrNull();
  if (me?.name) return <AppShell me={me}>{children}</AppShell>;
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16">{children}</main>
      <Footer />
    </>
  );
}
