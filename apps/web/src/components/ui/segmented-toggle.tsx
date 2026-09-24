'use client';

import { cn } from '@/lib/utils';

/**
 * Two-option pill toggle with a sliding thumb. Inspired by uiverse.io toggles (MIT).
 * Implemented as an ARIA tablist; pair each option with a tabpanel.
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  idPrefix,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix: string;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative inline-grid rounded-full bg-ink-100 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-white shadow transition-transform duration-300 ease-out"
        style={{
          width: `calc((100% - 0.5rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${o.value}`}
          aria-controls={`${idPrefix}-panel-${o.value}`}
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative z-10 rounded-full px-5 py-2 text-sm font-semibold transition-colors',
            o.value === value ? 'text-ink-950' : 'text-ink-700 hover:text-ink-950',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
