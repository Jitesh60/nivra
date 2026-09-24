import { faqs } from '@/content/site-content';

export function FaqList({ limit }: { limit?: number }) {
  return (
    <div className="divide-y divide-ink-200 rounded-xl border border-ink-200 bg-white">
      {faqs.slice(0, limit).map((f) => (
        <details key={f.q} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer items-center justify-between gap-4 font-display text-lg font-semibold text-ink-950">
            {f.q}
            <span aria-hidden className="text-brand-600 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-ink-600">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
