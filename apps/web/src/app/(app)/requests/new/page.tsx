import { PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import { RequestForm } from '@/components/growth/request-form';
import { getCategories } from '@/lib/discovery';
import { createRequestAction } from '../../growth-actions';

export const metadata: Metadata = { title: 'Ask for something' };

export default async function NewRequestPage() {
  const categories = await getCategories();
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader
        title="Ask for something"
        description="Lenders near you get notified and can reply with their listing."
      />
      <section className="rounded-lg border border-sj-border bg-sj-surface p-5 shadow-xs">
        <RequestForm categories={categories} submit={createRequestAction} />
      </section>
    </div>
  );
}
