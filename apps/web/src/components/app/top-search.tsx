'use client';

import { Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { NavLink } from './nav-link';

/** The top bar's search; Explore has its own, so it steps aside there. */
export function TopSearch() {
  const pathname = usePathname();
  if (pathname === '/explore' || pathname.startsWith('/explore/')) {
    return <div className="flex-1" />;
  }
  return (
    <>
      <form
        action="/explore"
        role="search"
        className="relative mx-auto hidden w-full max-w-md md:block"
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-sj-muted-foreground" />
        <input
          type="search"
          name="q"
          aria-label="Search items to borrow"
          placeholder="Search tents, cameras, drills…"
          className="h-10 w-full rounded-full border border-sj-border bg-sj-surface-muted/70 pr-4 pl-10 text-small transition-colors outline-none placeholder:text-sj-muted-foreground focus:border-sj-primary focus:bg-sj-surface"
        />
      </form>
      <NavLink
        href="/explore"
        label=""
        ariaLabel="Search"
        icon={<Search />}
        className="ml-auto md:hidden"
      />
    </>
  );
}
