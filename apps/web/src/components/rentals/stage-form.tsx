'use client';

import { Button, Input, Textarea } from '@sajha/ui';
import { Camera, X } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';
import { shrinkImage } from '@/lib/client-image';

type Result = { error?: string };

/** Photos picked before sending: thumbnails with remove, and an add tile. */
export function PhotoPicker({
  files,
  setFiles,
  max,
  label,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  max: number;
  label: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid gap-2">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {files.map((f, i) => (
          <li key={`${f.name}-${i}`} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
            <img
              src={URL.createObjectURL(f)}
              alt={`Photo ${i + 1}`}
              className="aspect-square w-full rounded-md object-cover"
            />
            <button
              type="button"
              aria-label={`Remove photo ${i + 1}`}
              onClick={() => setFiles(files.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-white/90"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
        {files.length < max && (
          <li>
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="grid aspect-square w-full place-items-center rounded-md border-2 border-dashed border-sj-border text-sj-muted-foreground"
            >
              <Camera className="size-6" />
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          setFiles([...files, ...picked].slice(0, max));
          e.target.value = '';
        }}
      />
    </div>
  );
}

async function toForm(files: File[], fields: Record<string, string>): Promise<FormData> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append('photos', await shrinkImage(f));
  return form;
}

/** Type the other person's 6-digit code and photograph the item's condition. */
export function StageForm({
  stage,
  submit,
}: {
  stage: 'handover' | 'return';
  submit: (form: FormData) => Promise<Result>;
}) {
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setError((await submit(await toForm(files, { code, note })))?.error));
      }}
    >
      <label className="grid gap-1 text-caption font-semibold">
        Their code
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••••"
          required
          className="text-center font-mono text-h3 tracking-[0.5em]"
        />
      </label>
      <div className="grid gap-1">
        <p className="text-caption font-semibold">Condition photos (2 to 6)</p>
        <PhotoPicker files={files} setFiles={setFiles} max={6} label="Condition photos" />
      </div>
      <label className="grid gap-1 text-caption font-semibold">
        Note (optional)
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Any scratches or missing parts?"
          className="min-h-20"
        />
      </label>
      <FormMessage error={error} />
      <Button
        type="submit"
        loading={pending}
        loadingLabel="Confirming"
        disabled={code.length !== 6 || files.length < 2}
      >
        {stage === 'handover' ? 'Confirm handover' : 'Confirm return'}
      </Button>
    </form>
  );
}
