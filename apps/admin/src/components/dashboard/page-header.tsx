import { PageHeader as SajhaPageHeader } from '@sajha/ui';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <SajhaPageHeader className="mb-6" title={title} description={description} actions={actions} />
  );
}
