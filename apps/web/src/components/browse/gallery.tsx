'use client';

import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type Photo = { id: string; url: string; thumbUrl: string };

/** A large photo with thumbnails underneath. */
export function Gallery({ photos, title }: { photos: Photo[]; title: string }) {
  const [index, setIndex] = useState(0);
  const current = photos[index];
  if (!current) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-lg bg-sj-surface-muted text-sj-muted-foreground">
        <ImageOff className="size-8" />
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="overflow-hidden rounded-lg bg-sj-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
        <img
          src={current.url}
          alt={`${title}, photo ${index + 1} of ${photos.length}`}
          className="aspect-[4/3] w-full object-contain"
        />
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                i === index
                  ? 'border-sj-primary'
                  : 'border-transparent opacity-80 hover:opacity-100',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
              <img src={p.thumbUrl} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
