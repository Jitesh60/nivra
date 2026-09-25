import type { ReactNode } from 'react';

export function LegalDraftNotice({ updated }: { updated: string }) {
  return (
    <p className="rounded-lg border border-accent-300 bg-accent-50 p-4 text-sm text-accent-900">
      <strong>Draft for review.</strong> This page is a working draft (last updated {updated}) and
      will be reviewed by legal counsel before Nivra launches.
    </p>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-ink-700 [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-ink-950 [&_li]:mt-1 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
      {children}
    </div>
  );
}
