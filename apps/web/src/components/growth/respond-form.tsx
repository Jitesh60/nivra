'use client';

import { Button, Textarea } from '@sajha/ui';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';

export function RespondForm({
  listings,
  submit,
}: {
  listings: { id: string; title: string }[];
  submit: (listingId: string, message: string) => Promise<{ error?: string; success?: string }>;
}) {
  const [listingId, setListingId] = useState(listings[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<{ error?: string; success?: string }>({});
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setState(await submit(listingId, message)));
      }}
    >
      <label className="grid gap-1 text-caption font-semibold">
        Your listing
        <select
          value={listingId}
          onChange={(e) => setListingId(e.target.value)}
          className="h-11 rounded-md border border-sj-input bg-sj-surface px-3 text-body"
        >
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-caption font-semibold">
        Message
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          required
          placeholder="It’s free those days. Happy to help!"
        />
      </label>
      <FormMessage error={state.error} success={state.success} />
      <div>
        <Button type="submit" loading={pending} loadingLabel="Sending">
          Send reply
        </Button>
      </div>
    </form>
  );
}
