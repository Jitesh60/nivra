'use client';

import { Button, Input } from '@sajha/ui';
import { LocateFixed } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useActionState, useState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';
import type { FormState } from './details-form';

const PickupMap = dynamic(() => import('./pickup-map').then((m) => m.PickupMap), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-md bg-sj-surface-muted" />,
});

/** Where the item is handed over: a pin on the map, the area name and the exact address. */
export function PickupEditor({
  action,
  initial,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial: {
    lat?: number | null;
    lng?: number | null;
    areaLabel?: string | null;
    exactAddress?: string | null;
  };
}) {
  const [state, formAction] = useActionState(action, {});
  const [point, setPoint] = useState(
    initial.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null,
  );
  const [locating, setLocating] = useState<string>();

  const locate = () => {
    if (!('geolocation' in navigator)) return setLocating('Your browser can’t share its location.');
    setLocating('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(undefined);
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setLocating('Location is off. Click the map instead.'),
      { timeout: 10_000 },
    );
  };

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="lat" value={point?.lat ?? ''} />
      <input type="hidden" name="lng" value={point?.lng ?? ''} />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={locate}>
            <LocateFixed /> Use my location
          </Button>
          <span className="text-caption text-sj-muted-foreground">
            {locating ?? (point ? 'Drag the pin to adjust.' : 'Or click the map to drop the pin.')}
          </span>
        </div>
        <PickupMap value={point} onChange={setPoint} />
        {state.fields?.lat && <p className="text-caption text-sj-danger">{state.fields.lat}</p>}
      </div>
      <Field
        label="Area name"
        htmlFor="areaLabel"
        error={state.fields?.areaLabel}
        hint="Shown to everyone, e.g. “Kothrud, Pune”."
      >
        <Input
          id="areaLabel"
          name="areaLabel"
          required
          minLength={2}
          maxLength={80}
          defaultValue={initial.areaLabel ?? ''}
        />
      </Field>
      <Field
        label="Exact address (optional)"
        htmlFor="exactAddress"
        error={state.fields?.exactAddress}
        hint="Only shared with a borrower once their booking is confirmed."
      >
        <Input
          id="exactAddress"
          name="exactAddress"
          maxLength={300}
          defaultValue={initial.exactAddress ?? ''}
        />
      </Field>
      <FormMessage error={state.error} success={state.success} />
      <div>
        <SubmitButton loadingLabel="Saving">Save pickup</SubmitButton>
      </div>
    </form>
  );
}
