import { ShaderBackground } from '@sajha/ui';
import { Logo } from '@sajha/ui';

/** Sign-in screens: the brand shader on the left, the form on the right. */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="relative isolate hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <ShaderBackground testId="auth" />
        <Logo inverse suffix="Admin" tagline />
        <div className="max-w-md space-y-3">
          <p className="font-display text-display">Run the marketplace with care.</p>
          <p className="text-body text-white/80">
            Listings, bookings, payments and disputes: everything the community trusts us with, in
            one place.
          </p>
        </div>
        <p className="text-caption text-white/70">Staff only. Every action is logged.</p>
      </section>
      <section className="relative flex items-center justify-center p-4 sm:p-8">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--sj-primary)_14%,transparent),transparent_55%),radial-gradient(ellipse_at_bottom_right,color-mix(in_oklab,var(--sj-accent)_10%,transparent),transparent_50%)] lg:hidden"
        />
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center lg:hidden">
            <Logo suffix="Admin" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
