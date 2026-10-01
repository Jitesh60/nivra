import { EmptyState, PageHeader } from '@sajha/ui';
import { BellRing } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SavedSearchControls } from '@/components/growth/saved-search-controls';
import { getSavedSearches } from '@/lib/growth';
import { rupees } from '@/lib/format';
import { deleteSavedSearchAction, setAlertsAction } from '../growth-actions';

export const metadata: Metadata = { title: 'Saved searches' };

export default async function SavedSearchesPage() {
  const saved = await getSavedSearches();
  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader title="Saved searches" description="We tell you when something new matches." />
      {saved.length === 0 ? (
        <EmptyState
          icon={<BellRing />}
          title="No saved searches"
          description="On Explore, turn on “Near me”, search, then tap “Save search”."
        />
      ) : (
        <ul className="grid gap-3">
          {saved.map((s) => {
            const f = s.filters;
            const bits = [
              f.q && `“${f.q}”`,
              f.radiusKm && `within ${f.radiusKm} km`,
              f.maxPricePaise && `up to ${rupees(f.maxPricePaise)}/day`,
            ].filter(Boolean);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sj-border bg-sj-surface p-4"
              >
                <Link
                  href={`/saved-searches/${s.id}`}
                  className="grid min-w-0 gap-0.5 hover:underline"
                >
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-caption text-sj-muted-foreground">
                    {bits.join(' · ') || 'Everything nearby'}
                  </span>
                </Link>
                <SavedSearchControls
                  alerts={s.alertsEnabled}
                  setAlerts={setAlertsAction.bind(null, s.id)}
                  remove={deleteSavedSearchAction.bind(null, s.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
