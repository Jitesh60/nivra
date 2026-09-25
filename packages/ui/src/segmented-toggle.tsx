'use client';

import { cn } from './cn';

/**
 * Pill toggle with a sliding thumb. Inspired by uiverse.io toggles (MIT).
 * An ARIA tablist; pair each option with a tabpanel
 * (`${idPrefix}-panel-${value}`).
 */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  label,
  idPrefix,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix: string;
  className?: string;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('relative inline-grid rounded-full bg-sj-surface-muted p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 rounded-full bg-sj-surface shadow-sm transition-transform duration-200 ease-standard"
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
            'relative z-10 h-9 rounded-full px-5 text-small font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-sj-ring',
            o.value === value
              ? 'text-sj-foreground'
              : 'text-sj-foreground/75 hover:text-sj-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
