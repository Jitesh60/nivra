'use client';

import { Input } from '@sajha/ui';
import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/app/form-bits';
import { DOC_LABEL } from '@/lib/format';
import type { FormState } from './details-form';

type Doc = { docType: string; note?: string | null };

/** Which documents a borrower must share before you accept (shown on the item page). */
export function DocsEditor({
  action,
  initial,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial: Doc[];
}) {
  const [state, formAction] = useActionState(action, {});
  const chosen = new Map(initial.map((d) => [d.docType, d.note ?? '']));
  return (
    <form action={formAction} className="grid gap-3">
      {Object.entries(DOC_LABEL).map(([type, label]) => (
        <div key={type} className="grid gap-1.5 rounded-md border border-sj-border p-3">
          <label className="flex items-center gap-2 text-small font-semibold">
            <input
              type="checkbox"
              name="docType"
              value={type}
              defaultChecked={chosen.has(type)}
              className="size-4 accent-[var(--sj-primary)]"
            />
            {label}
          </label>
          <Input
            name={`note-${type}`}
            aria-label={`${label} note`}
            placeholder="Note for the borrower (optional), e.g. “PAN or Aadhaar”"
            maxLength={80}
            defaultValue={chosen.get(type) ?? ''}
            className="h-9 text-small"
          />
        </div>
      ))}
      <FormMessage error={state.error} success={state.success} />
      <div>
        <SubmitButton variant="secondary" loadingLabel="Saving">
          Save documents
        </SubmitButton>
      </div>
    </form>
  );
}
