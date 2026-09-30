import { Logo } from '@sajha/ui';
import Link from 'next/link';

/** Sign-in pages: a centred card on the soft background, no site chrome. */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-sj-background px-4 py-10">
      <Link href="/" aria-label="Nivra home" className="mb-8 rounded-md">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-sj-border bg-sj-surface p-6 shadow-sm sm:p-8">
        {children}
      </div>
      <p className="mt-6 max-w-sm text-center text-caption text-sj-muted-foreground">
        By continuing you agree to Nivra’s{' '}
        <Link href="/terms" className="underline underline-offset-2">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}
