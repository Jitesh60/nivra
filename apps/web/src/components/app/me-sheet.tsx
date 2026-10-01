'use client';

import { ChevronRight, LogOut, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ME_ACCOUNT, ME_SECTIONS, type MeLink } from '@/lib/app-nav';
import { cn } from '@/lib/utils';
import { Avatar } from './avatar';
import { useUnread } from './unread';

/**
 * Everything else, in a sheet that rises from the dock: borrowing and
 * lending side by side (one account does both), then account links.
 */
export function MeSheet({
  open,
  onClose,
  name,
  avatarUrl,
}: {
  open: boolean;
  onClose: () => void;
  name?: string | null;
  avatarUrl?: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Me"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'me-sheet fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-sj-border bg-sj-surface p-0 text-sj-foreground shadow-2xl sm:bottom-4 sm:rounded-3xl',
      )}
    >
      <div className="grid gap-5 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-sj-border sm:hidden" />
        <div className="flex items-center gap-3">
          <Avatar name={name} url={avatarUrl} size={48} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-h3">{name ?? 'Your account'}</p>
            <Link
              href="/profile"
              onClick={onClose}
              className="text-small font-semibold text-sj-primary hover:underline"
            >
              View profile
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full hover:bg-sj-surface-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <p className="rounded-2xl bg-sj-surface-muted px-4 py-3 text-small text-sj-muted-foreground">
          One account does both: borrow things you need and lend things you don’t.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {ME_SECTIONS.map((section) => (
            <section
              key={section.title}
              aria-label={section.title}
              className="rounded-2xl border border-sj-border p-3"
            >
              <h2 className="px-2 pt-1 font-display text-body font-bold">{section.title}</h2>
              <p className="px-2 pb-2 text-caption text-sj-muted-foreground">{section.hint}</p>
              <ul className="grid">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <SheetLink link={link} onNavigate={onClose} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section aria-label="Account" className="grid">
          <ul className="grid sm:grid-cols-2">
            {ME_ACCOUNT.map((link) => (
              <li key={link.href}>
                <SheetLink link={link} onNavigate={onClose} />
              </li>
            ))}
          </ul>
        </section>

        <form action="/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sj-border py-3 text-small font-semibold text-sj-danger hover:bg-sj-surface-muted"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </form>
      </div>
    </dialog>
  );
}

function SheetLink({ link, onNavigate }: { link: MeLink; onNavigate: () => void }) {
  const badge = useUnread(link.badgeKey);
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-small font-semibold transition-colors hover:bg-sj-surface-muted"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-sj-primary-soft text-sj-on-primary-soft [&_svg]:size-4">
        <Icon />
      </span>
      <span className="flex-1">{link.label}</span>
      {badge ? (
        <span className="rounded-full bg-sj-accent px-1.5 text-[11px] leading-5 font-bold text-sj-on-accent">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      <ChevronRight className="size-4 text-sj-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
