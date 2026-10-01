'use client';

import { Button, Input, Textarea } from '@sajha/ui';
import { Star } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';
import { shrinkImage } from '@/lib/client-image';
import { PhotoPicker } from './stage-form';

type Result = { error?: string };

async function withPhotos(fields: Record<string, string>, files: File[]) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  for (const f of files) form.append('photos', await shrinkImage(f));
  return form;
}

const REASONS = [
  ['DAMAGE', 'Damaged'],
  ['MISSING_PARTS', 'Missing parts'],
  ['NOT_RETURNED', 'Not returned'],
  ['OTHER', 'Something else'],
] as const;

/** The lender raises a problem after the return: what, how much, and photos. */
export function DisputeForm({
  submit,
  maxClaimRupees,
}: {
  submit: (f: FormData) => Promise<Result>;
  maxClaimRupees: number;
}) {
  const [reason, setReason] = useState<string>('DAMAGE');
  const [description, setDescription] = useState('');
  const [claim, setClaim] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () =>
          setError((await submit(await withPhotos({ reason, description, claim }, files)))?.error),
        );
      }}
    >
      <label className="grid gap-1 text-caption font-semibold">
        What went wrong?
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-11 rounded-md border border-sj-input bg-sj-surface px-3 text-body"
        >
          {REASONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-caption font-semibold">
        Describe it
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minLength={10}
          maxLength={2000}
          required
        />
      </label>
      <label className="grid gap-1 text-caption font-semibold">
        Amount you’re claiming (₹, up to the deposit: ₹{maxClaimRupees.toLocaleString('en-IN')})
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={maxClaimRupees}
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          required
        />
      </label>
      <div className="grid gap-1">
        <p className="text-caption font-semibold">Photos</p>
        <PhotoPicker files={files} setFiles={setFiles} max={6} label="Dispute photos" />
      </div>
      <FormMessage error={error} />
      <Button type="submit" variant="danger" loading={pending} loadingLabel="Sending">
        Raise the problem
      </Button>
    </form>
  );
}

/** The borrower answers a dispute with their side and photos. */
export function RespondForm({ submit }: { submit: (f: FormData) => Promise<Result> }) {
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setError((await submit(await withPhotos({ note }, files)))?.error));
      }}
    >
      <label className="grid gap-1 text-caption font-semibold">
        Your side
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          minLength={10}
          maxLength={2000}
          required
        />
      </label>
      <div className="grid gap-1">
        <p className="text-caption font-semibold">Photos (optional)</p>
        <PhotoPicker files={files} setFiles={setFiles} max={6} label="Response photos" />
      </div>
      <FormMessage error={error} />
      <Button type="submit" loading={pending} loadingLabel="Sending">
        Send my response
      </Button>
    </form>
  );
}

export function ReviewForm({
  submit,
}: {
  submit: (rating: number, comment: string) => Promise<Result>;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setError((await submit(rating, comment))?.error));
      }}
    >
      <div role="radiogroup" aria-label="Rating" className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
            className="rounded-md p-1"
          >
            <Star
              className={`size-8 ${n <= rating ? 'fill-sj-warning text-sj-warning' : 'text-sj-border'}`}
            />
          </button>
        ))}
      </div>
      <label className="grid gap-1 text-caption font-semibold">
        A few words (optional)
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </label>
      <p className="text-caption text-sj-muted-foreground">
        Reviews are published once you’ve both written one, or after 7 days.
      </p>
      <FormMessage error={error} />
      <Button type="submit" disabled={!rating} loading={pending} loadingLabel="Posting">
        Post review
      </Button>
    </form>
  );
}
