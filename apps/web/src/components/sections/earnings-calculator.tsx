'use client';

import { useId, useState } from 'react';
import { formatInr } from '@/lib/utils';

export const PLATFORM_FEE = 0.1;

export function monthlyEarnings(pricePerDay: number, daysPerMonth: number): number {
  return pricePerDay * daysPerMonth * (1 - PLATFORM_FEE);
}

export function EarningsCalculator() {
  const [price, setPrice] = useState(150);
  const [days, setDays] = useState(8);
  const priceId = useId();
  const daysId = useId();
  const perMonth = monthlyEarnings(price, days);

  return (
    <div className="grid gap-8 rounded-2xl border border-ink-200 bg-white p-6 sm:p-10 md:grid-cols-2">
      <div className="grid content-start gap-8">
        <div>
          <label
            htmlFor={priceId}
            className="flex justify-between text-sm font-medium text-ink-700"
          >
            <span>Price per day</span>
            <span className="font-semibold text-ink-950">{formatInr(price)}</span>
          </label>
          <input
            id={priceId}
            type="range"
            min={50}
            max={2000}
            step={50}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="mt-3 w-full accent-brand-600"
          />
        </div>
        <div>
          <label htmlFor={daysId} className="flex justify-between text-sm font-medium text-ink-700">
            <span>Days rented per month</span>
            <span className="font-semibold text-ink-950">{days}</span>
          </label>
          <input
            id={daysId}
            type="range"
            min={1}
            max={30}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="mt-3 w-full accent-brand-600"
          />
        </div>
      </div>
      <div className="rounded-xl bg-brand-950 p-8 text-white" aria-live="polite">
        <p className="text-sm text-brand-200">You could earn</p>
        <p className="mt-1 font-display text-5xl font-bold" data-testid="monthly-earnings">
          {formatInr(perMonth)}
          <span className="text-lg font-medium text-brand-200"> / month</span>
        </p>
        <p className="mt-3 text-brand-100">
          {formatInr(perMonth * 12)} a year, from something you already own.
        </p>
        <p className="mt-6 text-xs text-brand-300">
          After Sajha’s {PLATFORM_FEE * 100}% fee. Actual earnings depend on demand in your area.
        </p>
      </div>
    </div>
  );
}
