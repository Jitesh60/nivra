'use client';

import { Button } from '@sajha/ui';
import { Camera } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { Avatar } from '@/components/app/avatar';
import { FormMessage } from '@/components/app/form-bits';
import { shrinkImage } from '@/lib/client-image';
import { removeAvatarAction, setAvatarAction, type FormState } from './actions';

export function AvatarEditor({ name, url }: { name?: string | null; url?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<FormState>({});
  const [pending, start] = useTransition();

  const pick = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      const form = new FormData();
      form.set('photo', await shrinkImage(file, 1024));
      setState(await setAvatarAction(form));
      if (input.current) input.current.value = '';
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar name={name} url={url} size={80} />
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={pending}
            loadingLabel="Uploading"
            onClick={() => input.current?.click()}
          >
            <Camera /> {url ? 'Change photo' : 'Add photo'}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => start(async () => setState(await removeAvatarAction()))}
            >
              Remove
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label="Profile photo"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <FormMessage error={state.error} success={state.success} />
      </div>
    </div>
  );
}
