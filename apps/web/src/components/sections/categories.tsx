import { SpotlightCard } from '@/components/effects/spotlight-card';
import { categories } from '@/content/site-content';

export function CategoryGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((c) => (
        <li key={c.name}>
          <SpotlightCard className="h-full">
            <span className="text-3xl" aria-hidden>
              {c.emoji}
            </span>
            <h3 className="mt-3 font-display text-lg font-semibold text-ink-950">{c.name}</h3>
            <p className="mt-1 text-sm text-ink-600">{c.example}</p>
          </SpotlightCard>
        </li>
      ))}
    </ul>
  );
}
