'use client';

import { Button } from '@sajha/ui';
import { useTransition } from 'react';

export function MarkAllRead({ run }: { run: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="outline" size="sm" loading={pending} onClick={() => start(run)}>
      Mark all read
    </Button>
  );
}
