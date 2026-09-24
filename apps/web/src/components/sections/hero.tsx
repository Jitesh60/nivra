import { BlurText } from '@/components/effects/blur-text';
import { Magnet } from '@/components/effects/magnet';
import { ShaderHeroBackground } from '@/components/effects/shader-hero-background';
import { GlowLink } from '@/components/ui/glow-button';

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[92svh] items-center overflow-hidden px-4 pt-24 pb-16 text-white">
      <ShaderHeroBackground />
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-sm font-semibold tracking-widest text-brand-200 uppercase">
          साझा · Sajha
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[1.05] font-bold tracking-tight sm:text-7xl">
          <BlurText text="Borrow what you need." className="block" />
          <BlurText text="Lend what you don’t use." className="block text-accent-300" delay={0.3} />
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ink-100 sm:text-xl">
          Rent trekking gear, cameras, tools and more from people near you, for a few days and a
          small price. Or earn from things that sit idle most of the year.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Magnet>
            <GlowLink href="#waitlist" className="px-7 py-3.5 text-base">
              Join the waitlist
            </GlowLink>
          </Magnet>
          <GlowLink href="/how-it-works" variant="ghost">
            How it works
          </GlowLink>
        </div>
        <p className="mt-8 text-sm text-ink-200">Launching in India · Free to join</p>
      </div>
    </section>
  );
}
