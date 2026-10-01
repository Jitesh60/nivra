import { Button, PageHeader } from '@sajha/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { DetailsForm } from '@/components/listings/details-form';
import { getMe } from '@/lib/api';
import { getCategories } from '@/lib/discovery';
import { getAppConfig } from '@/lib/listings';
import { createListingAction } from '../actions';

export const metadata: Metadata = { title: 'List an item' };

export default async function NewListingPage() {
  const [me, categories, config] = await Promise.all([getMe(), getCategories(), getAppConfig()]);
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader
        title="List an item"
        description="Start with the basics. Photos, pickup and dates come next."
      />
      {!me.emailVerified ? (
        <section className="grid gap-3 rounded-lg border border-sj-border bg-sj-surface p-6">
          <h2 className="text-h3">Verify your email first</h2>
          <p className="text-small text-sj-muted-foreground">
            Lenders need a verified email for booking updates and payouts.
          </p>
          <div>
            <Button asChild>
              <Link href="/welcome/email?next=/listings/new">Verify email</Link>
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-sj-border bg-sj-surface p-6 shadow-xs">
          <DetailsForm
            action={createListingAction}
            categories={categories}
            rules={config}
            submitLabel="Continue"
          />
        </section>
      )}
    </div>
  );
}
