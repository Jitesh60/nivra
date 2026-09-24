'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/auth/submit-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { resolveReportAction } from '../actions';

export function ResolveForm({ id }: { id: string }) {
  const [state, action] = useActionState(resolveReportAction, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Close this report</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="id" value={id} />
          <fieldset className="grid gap-1 text-sm">
            <legend className="mb-1 font-medium">Outcome</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="outcome" value="ACTIONED" required /> Actioned (we did
              something: warned, suspended, unpublished…)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="outcome" value="DISMISSED" /> Dismissed (nothing wrong)
            </label>
          </fieldset>
          <Label htmlFor="resolve-note">Note for the record</Label>
          <Textarea
            id="resolve-note"
            name="note"
            required
            minLength={3}
            maxLength={1000}
            placeholder="What you checked and what you did."
          />
          <SubmitButton>Close report</SubmitButton>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.done && (
            <p role="status" className="text-sm text-primary">
              {state.done}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
