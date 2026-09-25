'use client';

import { CircleAlert, CircleCheck } from 'lucide-react';
import { Toaster as Sonner } from 'sonner';

/** Sonner, styled per DESIGN.md: surface, radius md, shadow-lg, 4 s. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      duration={4000}
      icons={{
        success: <CircleCheck className="size-5 text-sj-success" />,
        error: <CircleAlert className="size-5 text-sj-danger" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            '!rounded-md !border !border-sj-border !bg-sj-surface !text-sj-foreground !shadow-lg !font-sans !text-small',
          description: '!text-sj-muted-foreground',
        },
      }}
    />
  );
}
