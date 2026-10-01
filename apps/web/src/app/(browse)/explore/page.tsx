import { Button, EmptyState, Input } from '@sajha/ui';
import { Search, SearchX, SlidersHorizontal } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AreaControl } from '@/components/browse/area-control';
import { ListingGrid } from '@/components/browse/listing-card';
import { SaveSearchButton } from '@/components/growth/save-search-button';
import { hasSession } from '@/lib/session';
import {
  getCategories,
  getHome,
  isSearch,
  parseBrowseQuery,
  search,
  type BrowseQuery,
  type ListingCard,
} from '@/lib/discovery';
import { CONDITION_LABEL, todayIst } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Explore things to rent near you',
  description:
    'Browse trekking gear, cameras, tools and more that people near you rent out by the day on Nivra.',
  alternates: { canonical: '/explore' },
};

type Params = Awaited<PageProps<'/explore'>['searchParams']>;

/** The current URL's query with some keys changed (null removes). */
function withParams(params: Params, change: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === 'cursor' || v === undefined) continue;
    for (const item of ([] as string[]).concat(v)) next.append(k, item);
  }
  for (const [k, v] of Object.entries(change)) {
    next.delete(k);
    if (v !== null) next.set(k, v);
  }
  const s = next.toString();
  return s ? `/explore?${s}` : '/explore';
}

export default async function ExplorePage({ searchParams }: PageProps<'/explore'>) {
  const params = await searchParams;
  const query = parseBrowseQuery(params);
  const searching = isSearch(query);
  const [categories, results, signedIn] = await Promise.all([
    getCategories(),
    searching ? search(query) : getHome(query),
    hasSession(),
  ]);
  const dates =
    query.startDate && query.endDate ? `start=${query.startDate}&end=${query.endDate}` : undefined;
  const activeCategory = categories.find((c) => c.id === query.categoryId);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h1 className="font-display text-h1 text-sj-foreground">
          <span className="gradient-text">
            {activeCategory ? activeCategory.name : searching ? 'Search results' : 'Rent it nearby'}
          </span>
        </h1>
        <SearchForm params={params} query={query} categories={categories} />
        <div className="flex flex-wrap items-center gap-2">
          <AreaControl />
          <div className="flex max-w-full min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            <CategoryChip href={withParams(params, { category: null })} active={!query.categoryId}>
              All
            </CategoryChip>
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                href={withParams(params, { category: c.id })}
                active={c.id === query.categoryId}
              >
                {c.name}
              </CategoryChip>
            ))}
          </div>
        </div>
      </div>

      {searching && signedIn && query.lat !== undefined && (
        <SaveSearchButton
          query={{ ...query, cursor: undefined }}
          name={query.q ?? activeCategory?.name ?? 'Nearby'}
        />
      )}
      {'items' in results ? (
        <Results
          items={results.items}
          dates={dates}
          moreHref={
            results.nextCursor ? withParams(params, { cursor: results.nextCursor }) : undefined
          }
          clearHref="/explore"
        />
      ) : (
        <>
          {query.lat !== undefined && (
            <Row title="Near you" items={results.nearYou} dates={dates} />
          )}
          <Row title="Popular this week" items={results.popularThisWeek} dates={dates} />
          <Row title="Just listed" items={results.newest} dates={dates} />
          {!results.nearYou.length && !results.popularThisWeek.length && !results.newest.length && (
            <EmptyState
              icon={<SearchX />}
              title="Nothing listed yet"
              description="Be the first: list something you rarely use and earn from it."
            />
          )}
        </>
      )}
    </div>
  );
}

function CategoryChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-small font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'bg-sj-foreground text-sj-background'
          : 'border border-sj-border bg-sj-surface hover:bg-sj-surface-muted'
      }`}
    >
      {children}
    </Link>
  );
}

function Row({ title, items, dates }: { title: string; items: ListingCard[]; dates?: string }) {
  if (!items.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-h3">{title}</h2>
      <ListingGrid listings={items} dates={dates} />
    </section>
  );
}

function Results({
  items,
  dates,
  moreHref,
  clearHref,
}: {
  items: ListingCard[];
  dates?: string;
  moreHref?: string;
  clearHref: string;
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={<SearchX />}
        title="No matches"
        description="Try fewer filters, other words, or a bigger distance."
        action={
          <Button asChild variant="secondary">
            <Link href={clearHref}>Clear search</Link>
          </Button>
        }
      />
    );
  }
  return (
    <section className="grid gap-6">
      <ListingGrid listings={items} dates={dates} />
      {moreHref && (
        <div className="text-center">
          <Button asChild variant="outline">
            <Link href={moreHref} scroll={false}>
              Show more
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function SearchForm({
  params,
  query,
  categories,
}: {
  params: Params;
  query: BrowseQuery;
  categories: { id: string; name: string }[];
}) {
  const keep = (name: string) => {
    const v = params[name];
    return typeof v === 'string' ? <input type="hidden" name={name} value={v} /> : null;
  };
  const filtersOn =
    query.minPricePaise !== undefined ||
    query.maxPricePaise !== undefined ||
    Boolean(query.condition?.length) ||
    query.verifiedLendersOnly ||
    query.sort ||
    query.startDate;
  return (
    <form action="/explore" method="get" className="grid gap-3">
      {keep('lat')}
      {keep('lng')}
      {keep('r')}
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-sj-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={query.q ?? ''}
            placeholder="Search tents, cameras, drills…"
            className="pl-10"
          />
        </label>
        <Button type="submit">Search</Button>
      </div>
      <details
        open={Boolean(filtersOn)}
        className="group rounded-lg border border-sj-border bg-sj-surface"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-small font-semibold">
          <SlidersHorizontal className="size-4" /> Dates and filters
          {filtersOn && <span className="size-2 rounded-full bg-sj-accent" aria-label="on" />}
        </summary>
        <div className="grid gap-4 border-t border-sj-border p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-caption font-semibold">
            From
            <Input type="date" name="start" min={todayIst()} defaultValue={query.startDate ?? ''} />
          </label>
          <label className="grid gap-1 text-caption font-semibold">
            To
            <Input type="date" name="end" min={todayIst()} defaultValue={query.endDate ?? ''} />
          </label>
          <label className="grid gap-1 text-caption font-semibold">
            Category
            <select
              name="category"
              defaultValue={query.categoryId ?? ''}
              className="h-11 rounded-md border border-sj-input bg-sj-surface px-3 text-body"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-caption font-semibold">
            Sort by
            <select
              name="sort"
              defaultValue={query.sort ?? ''}
              className="h-11 rounded-md border border-sj-input bg-sj-surface px-3 text-body"
            >
              <option value="">Best match</option>
              {query.lat !== undefined && <option value="distance">Nearest</option>}
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="newest">Newest</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-caption font-semibold">
              Min ₹/day
              <Input
                type="number"
                name="min"
                min={0}
                inputMode="numeric"
                defaultValue={query.minPricePaise !== undefined ? query.minPricePaise / 100 : ''}
              />
            </label>
            <label className="grid gap-1 text-caption font-semibold">
              Max ₹/day
              <Input
                type="number"
                name="max"
                min={0}
                inputMode="numeric"
                defaultValue={query.maxPricePaise !== undefined ? query.maxPricePaise / 100 : ''}
              />
            </label>
          </div>
          <fieldset className="grid gap-1 sm:col-span-2">
            <legend className="text-caption font-semibold">Condition</legend>
            <div className="flex flex-wrap gap-3 pt-1">
              {Object.entries(CONDITION_LABEL).map(([value, label]) => (
                <label key={value} className="flex items-center gap-1.5 text-small">
                  <input
                    type="checkbox"
                    name="condition"
                    value={value}
                    defaultChecked={query.condition?.includes(value as never)}
                    className="size-4 accent-[var(--sj-primary)]"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center gap-2 self-end text-small">
            <input
              type="checkbox"
              name="verified"
              value="1"
              defaultChecked={query.verifiedLendersOnly}
              className="size-4 accent-[var(--sj-primary)]"
            />
            ID-verified lenders only
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <Button type="submit" variant="secondary">
              Apply
            </Button>
            <Button asChild variant="ghost">
              <Link href="/explore">Reset</Link>
            </Button>
          </div>
        </div>
      </details>
    </form>
  );
}
