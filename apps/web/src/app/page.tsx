// Phase 0 placeholder. The full landing page (shaders.com hero, React Bits text
// effects, uiverse buttons, waitlist) is built in Phase 1d.
export default function Home() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--color-brand-700),transparent_55%),radial-gradient(ellipse_at_bottom_right,var(--color-accent-600),transparent_50%)] opacity-60"
      />
      <div className="relative max-w-2xl text-center">
        <p className="font-medium tracking-wide text-brand-300">साझा · Sajha</p>
        <h1 className="mt-4 font-display text-4xl leading-tight font-semibold sm:text-6xl">
          Borrow what you need.
          <br />
          <span className="text-accent-300">Lend what you don’t use.</span>
        </h1>
        <p className="mt-6 text-lg text-ink-200">
          Rent trekking gear, cameras, tools and more from people near you — or earn from things
          that sit idle most of the year.
        </p>
        <p className="mt-10 inline-block rounded-full border border-ink-50/20 px-4 py-2 text-sm text-ink-200">
          Coming soon
        </p>
      </div>
    </main>
  );
}
