import type { ReactNode } from 'react';
import { cn } from './cn';

/** A page title in display type, an optional hint, and actions on the right. */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <p className="text-caption tracking-wide text-sj-primary uppercase">{eyebrow}</p>
        )}
        <h1 className="font-display text-h1 text-sj-foreground">{title}</h1>
        {description && <p className="text-body text-sj-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
