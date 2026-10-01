'use client';

import { Button } from '@sajha/ui';
import { ImagePlus, Star, Trash2 } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';
import { shrinkImage } from '@/lib/client-image';

type Photo = { id: string; thumbUrl: string };
type Result = { error?: string; success?: string };

/** Upload, set the cover, and remove photos. The first photo is the cover. */
export function PhotosEditor({
  photos,
  max,
  add,
  remove,
  reorder,
}: {
  photos: Photo[];
  max: number;
  add: (form: FormData) => Promise<Result>;
  remove: (photoId: string) => Promise<Result>;
  reorder: (ids: string[]) => Promise<Result>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();
  const room = max - photos.length;

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, room);
    start(async () => {
      const form = new FormData();
      for (const file of picked) form.append('photos', await shrinkImage(file));
      setState(await add(form));
      if (input.current) input.current.value = '';
    });
  };

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((p, i) => (
          <li key={p.id} className="relative overflow-hidden rounded-md border border-sj-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
            <img
              src={p.thumbUrl}
              alt={`Photo ${i + 1}`}
              className="aspect-square w-full object-cover"
            />
            {i === 0 ? (
              <span className="absolute top-1.5 left-1.5 rounded-full bg-ink-950/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                Cover
              </span>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () =>
                    setState(
                      await reorder([
                        p.id,
                        ...photos.filter((o) => o.id !== p.id).map((o) => o.id),
                      ]),
                    ),
                  )
                }
                className="absolute top-1.5 left-1.5 grid size-8 place-items-center rounded-full bg-white/90 shadow-sm"
                aria-label={`Make photo ${i + 1} the cover`}
                title="Make cover"
              >
                <Star className="size-4" />
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => setState(await remove(p.id)))}
              className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-full bg-white/90 text-sj-danger shadow-sm"
              aria-label={`Remove photo ${i + 1}`}
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {room > 0 && (
          <li>
            <button
              type="button"
              disabled={pending}
              onClick={() => input.current?.click()}
              className="grid aspect-square w-full place-items-center rounded-md border-2 border-dashed border-sj-border text-sj-muted-foreground hover:bg-sj-surface-muted"
            >
              <span className="grid justify-items-center gap-1 text-caption font-semibold">
                <ImagePlus className="size-6" /> Add photos
              </span>
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Add listing photos"
        onChange={(e) => upload(e.target.files)}
      />
      <p className="text-caption text-sj-muted-foreground">
        Up to {max} photos. Bright, clear shots of the actual item rent best.
      </p>
      {pending && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading
          loadingLabel="Saving photos"
          className="justify-self-start"
        >
          Saving
        </Button>
      )}
      <FormMessage error={state.error} success={state.success} />
    </div>
  );
}
