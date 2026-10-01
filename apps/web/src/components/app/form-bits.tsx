'use client';

import { Button, type ButtonProps } from '@sajha/ui';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

/** A submit button that shows a loader while its form's action runs. */
export function SubmitButton({ children, loadingLabel, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} loadingLabel={loadingLabel} {...props}>
      {children}
    </Button>
  );
}

/** An error or success line under a form, announced to screen readers. */
export function FormMessage({
  error,
  success,
  className,
}: {
  error?: string;
  success?: string;
  className?: string;
}) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={cn('text-small', error ? 'text-sj-danger' : 'text-sj-success', className)}
    >
      {error ?? success}
    </p>
  );
}

/** A label, a field and its error, stacked. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={htmlFor} className="text-caption font-semibold text-sj-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-caption text-sj-danger">{error}</p>
      ) : hint ? (
        <p className="text-caption text-sj-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
