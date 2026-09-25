'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * The result of an action: shown in place (for screen readers and tests) and
 * as a toast, so it's noticed wherever the admin is looking.
 */
export function StatusMessage({
  children,
  className,
  ...props
}: { children: string } & Omit<React.ComponentProps<'p'>, 'children'>) {
  useEffect(() => {
    toast.success(children);
  }, [children]);
  return (
    <p role="status" className={cn('text-small text-sj-primary', className)} {...props}>
      {children}
    </p>
  );
}
