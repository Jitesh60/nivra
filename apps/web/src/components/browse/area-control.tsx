'use client';

import { LocateFixed, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

const RADII = [1, 2, 5, 10, 25];

/**
 * "Near me": asks the browser for its location and searches around it, like
 * the app's area picker. The area lives in the URL, so results are shareable.
 */
export function AreaControl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [status, setStatus] = useState<string>();
  const hasArea = params.has('lat') && params.has('lng');

  const go = (change: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params);
    next.delete('cursor');
    change(next);
    router.push(`${pathname}?${next}`);
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return setStatus('Your browser can’t share its location.');
    setStatus('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus(undefined);
        go((p) => {
          p.set('lat', pos.coords.latitude.toFixed(5));
          p.set('lng', pos.coords.longitude.toFixed(5));
          if (!p.has('r')) p.set('r', '5');
        });
      },
      () => setStatus('Location is off. Allow it in your browser to search near you.'),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  if (!hasArea) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={locate}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-sj-border bg-sj-surface px-3.5 text-small font-semibold hover:bg-sj-surface-muted"
        >
          <LocateFixed className="size-4" /> Near me
        </button>
        {status && <span className="text-caption text-sj-muted-foreground">{status}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-sj-primary-soft pr-1 pl-3.5 text-small font-semibold text-sj-on-primary-soft">
        <LocateFixed className="size-4" /> Near you
        <select
          aria-label="Distance"
          value={params.get('r') ?? '5'}
          onChange={(e) => go((p) => p.set('r', e.target.value))}
          className="rounded-full bg-transparent px-1 font-semibold outline-none"
        >
          {RADII.map((km) => (
            <option key={km} value={km}>
              {km} km
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Search everywhere"
          onClick={() =>
            go((p) => {
              p.delete('lat');
              p.delete('lng');
              p.delete('r');
              if (p.get('sort') === 'distance') p.delete('sort');
            })
          }
          className="grid size-7 place-items-center rounded-full hover:bg-white/60"
        >
          <X className="size-4" />
        </button>
      </span>
    </div>
  );
}
