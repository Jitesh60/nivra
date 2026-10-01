'use client';

import { Button, Input } from '@sajha/ui';
import { useRef, useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';
import { shrinkImage } from '@/lib/client-image';

type Result = { error?: string; success?: string };

const TYPES: [string, string][] = [
  ['AADHAAR_MASKED', 'Aadhaar (masked: only the last 4 digits visible)'],
  ['PAN', 'PAN card'],
  ['DRIVING_LICENCE', 'Driving licence'],
  ['PASSPORT', 'Passport'],
  ['VOTER_ID', 'Voter ID'],
  ['COLLEGE_ID', 'College ID'],
  ['EMPLOYEE_ID', 'Employee ID'],
  ['ADDRESS_PROOF', 'Address proof'],
  ['OTHER', 'Other'],
];

export function AddDocumentForm({ add }: { add: (form: FormData) => Promise<Result> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const raw = new FormData(e.currentTarget);
    start(async () => {
      const form = new FormData();
      for (const [k, v] of raw.entries()) {
        if (v instanceof File) {
          if (v.size > 0) form.set(k, await shrinkImage(v, 2400, 0.9));
        } else form.set(k, v);
      }
      const result = await add(form);
      setState(result);
      if (!result.error) formRef.current?.reset();
    });
  };

  return (
    <form ref={formRef} onSubmit={submit} className="grid gap-3">
      <label className="grid gap-1 text-caption font-semibold">
        Type
        <select
          name="type"
          required
          defaultValue=""
          className="h-11 rounded-md border border-sj-input bg-sj-surface px-3 text-body"
        >
          <option value="" disabled>
            Choose…
          </option>
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-caption font-semibold">
        Name on it (optional)
        <Input name="label" maxLength={80} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-caption font-semibold">
          Front photo
          <Input name="front" type="file" accept="image/jpeg,image/png,image/webp" required />
        </label>
        <label className="grid gap-1 text-caption font-semibold">
          Back photo (if it has one)
          <Input name="back" type="file" accept="image/jpeg,image/png,image/webp" />
        </label>
      </div>
      <label className="grid gap-1 text-caption font-semibold">
        Expiry date (if any)
        <Input name="expiresOn" type="date" />
      </label>
      <p className="text-caption text-sj-muted-foreground">
        For Aadhaar, upload the masked version (only the last 4 digits visible), as UIDAI advises.
      </p>
      <FormMessage error={state.error} success={state.success} />
      <div>
        <Button type="submit" loading={pending} loadingLabel="Uploading">
          Add document
        </Button>
      </div>
    </form>
  );
}

export function DeleteDocument({ remove }: { remove: () => Promise<Result> }) {
  const [state, setState] = useState<Result>({});
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-sj-danger"
        disabled={pending}
        onClick={() => {
          if (window.confirm('Delete this document?')) start(async () => setState(await remove()));
        }}
      >
        Delete
      </Button>
      <FormMessage error={state.error} />
    </div>
  );
}
