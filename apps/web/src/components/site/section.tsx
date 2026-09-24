import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-20 px-4 py-20 sm:py-24', className)}>
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">
            {title}
          </h2>
          {intro && <p className="mt-4 text-lg text-ink-600">{intro}</p>}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

export function PageShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <main>
      <div className="bg-ink-50 px-4 pt-16 pb-12">
        <div className="mx-auto max-w-6xl">
          <h1 className="font-display text-4xl font-bold tracking-tight text-ink-950 sm:text-5xl">
            {title}
          </h1>
          {intro && <p className="mt-4 max-w-2xl text-lg text-ink-600">{intro}</p>}
        </div>
      </div>
      {children}
    </main>
  );
}
