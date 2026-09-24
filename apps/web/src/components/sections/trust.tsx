import { trustPoints } from '@/content/site-content';

export function TrustGrid() {
  return (
    <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {trustPoints.map((p) => (
        <li key={p.title} className="border-l-2 border-brand-500 pl-4">
          <h3 className="font-display text-lg font-semibold text-ink-950">{p.title}</h3>
          <p className="mt-1 text-ink-600">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}
