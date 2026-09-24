import { Footer } from '@/components/site/footer';
import { Header } from '@/components/site/header';
import { GlowLink } from '@/components/ui/glow-button';

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-24 text-center">
        <p className="font-display text-6xl font-bold text-brand-700">404</p>
        <h1 className="font-display text-2xl font-semibold text-ink-950">This page isn’t here.</h1>
        <GlowLink href="/" variant="brand">
          Back to home
        </GlowLink>
      </main>
      <Footer />
    </>
  );
}
