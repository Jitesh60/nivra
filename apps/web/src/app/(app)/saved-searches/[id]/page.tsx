import { EmptyState, PageHeader } from '@sajha/ui';
import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListingGrid } from '@/components/browse/listing-card';
import { getSavedSearchResults, getSavedSearches } from '@/lib/growth';

export const metadata: Metadata = { title: 'Saved search' };

export default async function SavedSearchPage({ params }: PageProps<'/saved-searches/[id]'>) {
  const { id } = await params;
  const saved = (await getSavedSearches()).find((s) => s.id === id);
  if (!saved) notFound();
  const results = await getSavedSearchResults(id);
  return (
    <div className="grid gap-6">
      <PageHeader title={saved.name} description="Current matches." />
      {results.items.length ? (
        <ListingGrid listings={results.items} />
      ) : (
        <EmptyState
          icon={<SearchX />}
          title="Nothing matches right now"
          description="We’ll let you know when something does."
        />
      )}
    </div>
  );
}
