'use client';

import { Label as LabelPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from './cn';

const field = [
  'w-full min-w-0 rounded-md border border-sj-input bg-sj-surface px-3.5 text-body text-sj-foreground shadow-xs',
  'placeholder:text-sj-muted-foreground selection:bg-sj-primary selection:text-sj-on-primary',
  'transition-[border-color,box-shadow] duration-200 outline-none',
  'focus-visible:border-sj-ring focus-visible:ring-3 focus-visible:ring-sj-ring/25',
  'aria-invalid:border-sj-danger aria-invalid:ring-sj-danger/20',
  'disabled:cursor-not-allowed disabled:opacity-50',
];

/** 44 px, radius md, brand ring on focus (DESIGN.md §7). */
export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        field,
        'flex h-11 py-2 file:mr-3 file:h-7 file:rounded-full file:border-0 file:bg-sj-surface-muted file:px-3 file:text-small file:font-semibold file:text-sj-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(field, 'flex min-h-24 py-2.5', className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-caption font-semibold text-sj-foreground select-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
