import { WaitlistForm } from './waitlist-form';

export function WaitlistSection() {
  return (
    <section id="waitlist" className="scroll-mt-10 bg-ink-950 px-4 py-20 text-white sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-sm font-semibold tracking-wide text-brand-300 uppercase">
            Be the first in your city
          </p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Join the waitlist
          </h2>
          <p className="mt-4 text-lg text-ink-200">
            We’re launching city by city. Tell us where you are and whether you want to borrow, lend
            or both.
          </p>
          <p className="mt-6 text-sm text-ink-400">
            The app will be on Google Play and the App Store.
          </p>
        </div>
        <WaitlistForm />
      </div>
    </section>
  );
}
