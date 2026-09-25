import { STORE_LINKS } from '@/lib/site';
import { WaitlistSection } from './waitlist-section';

function StoreButton({ href, top, name }: { href: string; top: string; name: string }) {
  return (
    <a
      href={href}
      className="inline-flex flex-col rounded-xl border border-white/30 bg-black px-5 py-2.5 text-left text-white transition hover:border-white"
      rel="noopener"
    >
      <span className="text-xs text-ink-300">{top}</span>
      <span className="text-lg font-semibold">{name}</span>
    </a>
  );
}

/**
 * At launch (store URLs set at build time) this is the download section;
 * until then it's the waitlist. One env change flips the whole site.
 */
export function DownloadOrWaitlist() {
  const { play, appStore } = STORE_LINKS;
  if (!play && !appStore) return <WaitlistSection />;
  return (
    <section
      id="download"
      className="scroll-mt-10 bg-ink-950 px-4 py-20 text-white sm:py-24"
      data-testid="download"
    >
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-sm font-semibold tracking-wide text-brand-300 uppercase">Now in Pune</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Get the Nivra app
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-ink-200">
          Borrow what you need from people nearby, or start earning from the things you rarely use.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {play && <StoreButton href={play} top="Get it on" name="Google Play" />}
          {appStore && <StoreButton href={appStore} top="Download on the" name="App Store" />}
        </div>
      </div>
    </section>
  );
}
