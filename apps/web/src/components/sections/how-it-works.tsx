'use client';

import { useState } from 'react';
import { SegmentedToggle } from '@/components/ui/segmented-toggle';
import { borrowerSteps, lenderSteps } from '@/content/site-content';

type Side = 'borrow' | 'lend';

export function HowItWorksTabs({ initial = 'borrow' }: { initial?: Side }) {
  const [side, setSide] = useState<Side>(initial);
  const steps = side === 'borrow' ? borrowerSteps : lenderSteps;

  return (
    <div>
      <SegmentedToggle
        idPrefix="how"
        label="Show steps for"
        value={side}
        onChange={setSide}
        options={[
          { value: 'borrow', label: 'I want to borrow' },
          { value: 'lend', label: 'I want to lend' },
        ]}
      />
      <div role="tabpanel" id={`how-panel-${side}`} aria-labelledby={`how-tab-${side}`}>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-ink-200 bg-white p-6">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 font-display font-bold text-brand-700">
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold text-ink-950">{step.title}</h3>
              <p className="mt-2 text-ink-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
