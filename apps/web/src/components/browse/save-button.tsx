'use client';

import { Heart } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setSavedAction } from '@/lib/favorite-actions';
import { cn } from '@/lib/utils';

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

/** The wishlist heart. Guests go to sign-in and come back to the same page. */
export function SaveButton({
  listingId,
  saved: initial,
  title,
  size = 'md',
  className,
}: {
  listingId: string;
  saved: boolean;
  title: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [saved, setSaved] = useState(initial);
  // Bumped on each save, to replay the pop and sparks.
  const [burst, setBurst] = useState(0);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !saved;
    if (next) setBurst((b) => b + 1);
    start(async () => {
      setSaved(next);
      const result = await setSavedAction(listingId, next);
      if (result.ok) return setError(undefined);
      setSaved(!next);
      if (result.signIn) {
        const here = `${pathname}${search.size ? `?${search}` : ''}`;
        router.push(`/login?next=${encodeURIComponent(here)}`);
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from wishlist` : `Save ${title} to wishlist`}
      title={error ?? (saved ? 'Saved' : 'Save')}
      className={cn(
        'relative grid place-items-center rounded-full bg-white/90 text-ink-900 shadow-sm backdrop-blur transition hover:scale-105',
        size === 'sm' ? 'size-9' : 'size-11',
        className,
      )}
    >
      <Heart
        key={burst}
        className={cn(
          size === 'sm' ? 'size-4.5' : 'size-5',
          saved && 'fill-sj-danger text-sj-danger',
          burst > 0 && saved && 'heart-pop',
        )}
      />
      {burst > 0 && saved && (
        <span key={`s${burst}`} aria-hidden>
          {SPARKS.map((a) => (
            <span key={a} className="spark" style={{ '--a': `${a}deg` } as React.CSSProperties} />
          ))}
        </span>
      )}
    </button>
  );
}
