'use client';

import { Button, Input, Textarea } from '@sajha/ui';
import { LocateFixed } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { FormMessage } from '@/components/app/form-bits';
import { todayIst } from '@/lib/format';

const PickupMap = dynamic(
  () => import('@/components/listings/pickup-map').then((m) => m.PickupMap),
  {
    ssr: false,
    loading: () => <div className="h-72 animate-pulse rounded-md bg-sj-surface-muted" />,
  },
);

export function RequestForm({
  categories,
  submit,
}: {
  categories: { id: string; name: string }[];
  submit: (form: FormData) => Promise<{ error?: string }>;
}) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setPoint({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setError('Location is off. Click the map instead.'),
      { timeout: 10_000 },
    );
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (point) {
          form.set('lat', String(point.lat));
          form.set('lng', String(point.lng));
        }
        start(async () => setError((await submit(form))?.error));
      }}
    >
      <label className="grid gap-1 text-caption font-semibold">
        What do you need?
        <Input
          name="title"
          required
          minLength={3}
          maxLength={80}
          placeholder="e.g. A 4-person tent"
        />
      </label>
      <label className="grid gap-1 text-caption font-semibold">
        Details
        <Textarea
          name="details"
          required
          minLength={10}
          maxLength={1000}
          placeholder="When, for what, any must-haves"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-caption font-semibold">
          Category (optional)
          <select
            name="categoryId"
            defaultValue=""
            className="h-11 rounded-md border border-sj-input bg-sj-surface px-3 text-body"
          >
            <option value="">Any</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-caption font-semibold">
          Budget per day, ₹ (optional)
          <Input name="budget" type="number" inputMode="numeric" min={1} />
        </label>
        <label className="grid gap-1 text-caption font-semibold">
          From (optional)
          <Input name="startDate" type="date" min={todayIst()} />
        </label>
        <label className="grid gap-1 text-caption font-semibold">
          To (optional)
          <Input name="endDate" type="date" min={todayIst()} />
        </label>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={locate}>
            <LocateFixed /> Use my location
          </Button>
          <span className="text-caption text-sj-muted-foreground">
            {point ? 'Drag the pin to adjust.' : 'Or click the map.'}
          </span>
        </div>
        <PickupMap value={point} onChange={setPoint} />
      </div>
      <label className="grid gap-1 text-caption font-semibold">
        Area
        <Input
          name="areaLabel"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Kothrud, Pune"
        />
      </label>
      <FormMessage error={error} />
      <Button type="submit" loading={pending} loadingLabel="Posting">
        Post request
      </Button>
    </form>
  );
}
