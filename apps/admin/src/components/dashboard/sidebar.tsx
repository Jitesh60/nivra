'use client';

import { Logo, LogoMark } from '@sajha/ui';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';
import { cn } from '@/lib/utils';
import { NavLinks } from './nav-links';

type Items = { href: string; label: string }[];

/**
 * Desktop sidebar (md and up). It collapses to icons only; the choice is
 * kept in a cookie so the server renders it the same way (no flicker).
 */
export function Sidebar({
  items,
  showNav,
  defaultCollapsed,
}: {
  items: Items;
  showNav: boolean;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'open'}; path=/; max-age=31536000; samesite=strict`;
  };
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed ? 'true' : undefined}
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-card py-5 transition-[width] duration-200 ease-standard md:flex',
        collapsed ? 'w-[76px] px-3' : 'w-64 px-4',
      )}
    >
      <Link
        href="/"
        aria-label="Admin home"
        className={cn('mb-6 flex rounded-md', collapsed ? 'justify-center' : 'px-2')}
      >
        {collapsed ? <LogoMark className="size-9" /> : <Logo suffix="Admin" />}
      </Link>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {showNav && <NavLinks items={items} collapsed={collapsed} />}
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={cn(
          'mt-4 flex h-10 items-center gap-3 rounded-full text-small font-semibold text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
          collapsed ? 'size-10 justify-center self-center' : 'px-3.5',
        )}
      >
        <Toggle aria-hidden className="size-5 shrink-0" />
        {!collapsed && 'Collapse'}
      </button>
    </aside>
  );
}

/** Phones and small tablets: a menu button that opens the sidebar as a drawer. */
export function MobileNav({ items, showNav }: { items: Items; showNav: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 md:hidden">
      {showNav && (
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className="grid size-10 place-items-center rounded-full text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu aria-hidden className="size-6" />
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-ink-950/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
            <Dialog.Content
              data-testid="mobile-menu"
              className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-card px-4 py-5 shadow-lg outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
            >
              <div className="mb-6 flex items-center justify-between px-2">
                <Dialog.Title asChild>
                  <Link href="/" aria-label="Admin home" onClick={() => setOpen(false)}>
                    <Logo suffix="Admin" />
                  </Link>
                </Dialog.Title>
                <Dialog.Close
                  aria-label="Close menu"
                  className="grid size-10 place-items-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X aria-hidden className="size-5" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="sr-only">
                Go to a section of the admin panel.
              </Dialog.Description>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavLinks items={items} onNavigate={() => setOpen(false)} />
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
      <Link href="/" aria-label="Admin home" className="flex min-w-0 rounded-md">
        <LogoMark className="size-8" />
      </Link>
    </div>
  );
}
