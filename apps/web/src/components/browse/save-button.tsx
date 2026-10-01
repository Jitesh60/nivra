'use client';

import { Heart } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setSavedAction } from '@/lib/favorite-actions';
import { cn } from '@/lib/utils';

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
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !saved;
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
        'grid place-items-center rounded-full bg-white/90 text-ink-900 shadow-sm backdrop-blur transition hover:scale-105',
        size === 'sm' ? 'size-9' : 'size-11',
        className,
      )}
    >
      <Heart
        className={cn(
          size === 'sm' ? 'size-4.5' : 'size-5',
          saved && 'fill-sj-danger text-sj-danger',
        )}
      />
    </button>
  );
}
