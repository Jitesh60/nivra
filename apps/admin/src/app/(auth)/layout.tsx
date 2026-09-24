/** Sign-in screens: centered card on a soft brand gradient. */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,var(--color-brand-200),transparent_55%),radial-gradient(ellipse_at_bottom_right,var(--color-accent-100),transparent_50%)] motion-safe:animate-[pulse_8s_ease-in-out_infinite]"
      />
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-wide text-primary">
          Sajha Admin
        </p>
        {children}
      </div>
    </main>
  );
}
