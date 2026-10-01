'use client';

import { ChevronRight, LogOut, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ME_LINKS, type MeLink } from '@/lib/app-nav';
import { Avatar } from './avatar';
import { useUnread } from './unread';

/**
 * Everything not in the dock, as one short list in a sheet that rises from
 * the bottom: your profile, then the links, then Sign out.
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
      className="me-sheet fixed inset-x-0 top-auto bottom-0 m-0 mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-sj-border bg-sj-surface p-0 text-sj-foreground shadow-2xl sm:bottom-4 sm:rounded-3xl"
    >
      <div className="grid gap-4 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
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

        <ul className="grid">
          {ME_LINKS.map((link) => (
            <li key={link.href}>
              <SheetLink link={link} onNavigate={onClose} />
            </li>
          ))}
        </ul>

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
      className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-small font-semibold hover:bg-sj-surface-muted"
    >
      <Icon className="size-5 text-sj-muted-foreground" />
      <span className="flex-1">{link.label}</span>
      {badge ? (
        <span className="rounded-full bg-sj-accent px-1.5 text-[11px] leading-5 font-bold text-sj-on-accent">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      <ChevronRight className="size-4 text-sj-muted-foreground" />
    </Link>
  );
}
