import type { ReactNode } from 'react';
import { cn } from './cn';

/** An icon in a soft brand circle, a title, a hint and one action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-dashed border-sj-border px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="grid size-12 place-items-center rounded-full bg-sj-primary-soft text-sj-on-primary-soft [&_svg]:size-6">
          {icon}
        </div>
      )}
      <p className="text-h3 text-sj-foreground">{title}</p>
      {description && <p className="max-w-sm text-small text-sj-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
