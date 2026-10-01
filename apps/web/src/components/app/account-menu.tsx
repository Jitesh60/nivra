'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ACCOUNT_MENU } from '@/lib/app-nav';
import { Avatar } from './avatar';

/** The signed-in user's photo; opens links and Sign out. */
export function AccountMenu({
  name,
  avatarUrl,
  inverse = false,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  inverse?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-full p-0.5 pr-1.5 transition-colors ${
          inverse ? 'hover:bg-white/10' : 'hover:bg-sj-surface-muted'
        }`}
      >
        <Avatar name={name} url={avatarUrl} size={34} />
        <ChevronDown className="size-4 opacity-70" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-lg border border-sj-border bg-sj-surface py-1 text-sj-foreground shadow-md"
        >
          <p className="truncate px-4 py-2 text-small font-semibold">{name ?? 'Your account'}</p>
          <div className="my-1 border-t border-sj-border" />
          {ACCOUNT_MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-small hover:bg-sj-surface-muted"
            >
              {item.label}
            </Link>
          ))}
          <div className="my-1 border-t border-sj-border" />
          <form action="/logout" method="post">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-small text-sj-danger hover:bg-sj-surface-muted"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
