'use client';

import { Input, Textarea } from '@sajha/ui';
import { useActionState } from 'react';
import { Field, FormMessage, SubmitButton } from '@/components/app/form-bits';
import { CONDITION_LABEL } from '@/lib/format';

export interface FormState {
  error?: string;
  success?: string;
  fields?: Record<string, string>;
}

type Limit = { min: number; max: number };
export interface Rules {
  pricePerDayPaise: Limit;
  depositPaise: Limit;
  weeklyDiscountPct: Limit;
  rentalDays: Limit;
  advanceNoticeDays: Limit;
}

export interface Details {
  categoryId: string;
  title: string;
  description: string;
  condition: string;
  brand?: string | null;
  size?: string | null;
  pricePerDayPaise: number;
  depositPaise: number;
  weeklyDiscountPct: number;
  minDays: number;
  maxDays: number;
  advanceNoticeDays: number;
}

const select =
  'h-11 w-full rounded-md border border-sj-input bg-sj-surface px-3 text-body outline-none focus-visible:border-sj-ring focus-visible:ring-3 focus-visible:ring-sj-ring/25';

/** Title, category, condition, prices and rental rules: the same fields as the app. */
export function DetailsForm({
  action,
  categories,
  rules,
  initial,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  categories: { id: string; name: string }[];
  rules: Rules;
  initial?: Details;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const f = state.fields ?? {};
  const rupee = (p: number) => Math.round(p / 100);
  return (
    <form action={formAction} className="grid gap-4">
      <Field
        label="Title"
        htmlFor="title"
        error={f.title}
        hint="What it is, e.g. “2-person dome tent”."
      >
        <Input
          id="title"
          name="title"
          required
          minLength={5}
          maxLength={80}
          defaultValue={initial?.title}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="categoryId" error={f.categoryId}>
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={initial?.categoryId ?? ''}
            className={select}
          >
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition" htmlFor="condition" error={f.condition}>
          <select
            id="condition"
            name="condition"
            required
            defaultValue={initial?.condition ?? 'GOOD'}
            className={select}
          >
            {Object.entries(CONDITION_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field
        label="Description"
        htmlFor="description"
        error={f.description}
        hint="What’s included, its age and any quirks. At least 20 characters."
      >
        <Textarea
          id="description"
          name="description"
          required
          minLength={20}
          maxLength={2000}
          defaultValue={initial?.description}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand (optional)" htmlFor="brand" error={f.brand}>
          <Input id="brand" name="brand" maxLength={40} defaultValue={initial?.brand ?? ''} />
        </Field>
        <Field label="Size (optional)" htmlFor="size" error={f.size}>
          <Input id="size" name="size" maxLength={40} defaultValue={initial?.size ?? ''} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Price per day (₹)"
          htmlFor="price"
          error={f.price}
          hint={`₹${rupee(rules.pricePerDayPaise.min)}–₹${rupee(rules.pricePerDayPaise.max).toLocaleString('en-IN')}`}
        >
          <Input
            id="price"
            name="price"
            type="number"
            inputMode="numeric"
            required
            min={rupee(rules.pricePerDayPaise.min)}
            max={rupee(rules.pricePerDayPaise.max)}
            defaultValue={initial ? rupee(initial.pricePerDayPaise) : ''}
          />
        </Field>
        <Field
          label="Refundable deposit (₹)"
          htmlFor="deposit"
          error={f.deposit}
          hint="Returned after a good return."
        >
          <Input
            id="deposit"
            name="deposit"
            type="number"
            inputMode="numeric"
            required
            min={rupee(rules.depositPaise.min)}
            max={rupee(rules.depositPaise.max)}
            defaultValue={initial ? rupee(initial.depositPaise) : ''}
          />
        </Field>
        <Field
          label="Weekly discount (%)"
          htmlFor="weeklyDiscountPct"
          error={f.weeklyDiscountPct}
          hint="For 7+ day rentals."
        >
          <Input
            id="weeklyDiscountPct"
            name="weeklyDiscountPct"
            type="number"
            inputMode="numeric"
            min={rules.weeklyDiscountPct.min}
            max={rules.weeklyDiscountPct.max}
            defaultValue={initial?.weeklyDiscountPct ?? 0}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Shortest rental (days)" htmlFor="minDays" error={f.minDays}>
          <Input
            id="minDays"
            name="minDays"
            type="number"
            inputMode="numeric"
            min={rules.rentalDays.min}
            max={rules.rentalDays.max}
            defaultValue={initial?.minDays ?? rules.rentalDays.min}
          />
        </Field>
        <Field label="Longest rental (days)" htmlFor="maxDays" error={f.maxDays}>
          <Input
            id="maxDays"
            name="maxDays"
            type="number"
            inputMode="numeric"
            min={rules.rentalDays.min}
            max={rules.rentalDays.max}
            defaultValue={initial?.maxDays ?? Math.min(14, rules.rentalDays.max)}
          />
        </Field>
        <Field label="Notice needed (days)" htmlFor="advanceNoticeDays" error={f.advanceNoticeDays}>
          <Input
            id="advanceNoticeDays"
            name="advanceNoticeDays"
            type="number"
            inputMode="numeric"
            min={rules.advanceNoticeDays.min}
            max={rules.advanceNoticeDays.max}
            defaultValue={initial?.advanceNoticeDays ?? rules.advanceNoticeDays.min}
          />
        </Field>
      </div>
      <FormMessage error={state.error} success={state.success} />
      <div>
        <SubmitButton loadingLabel="Saving">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
