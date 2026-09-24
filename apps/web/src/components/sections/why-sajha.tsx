import { CountUp } from '@/components/effects/count-up';

/** Illustrative figures from the example in the PRD, not usage statistics. */
const facts = [
  { value: 6000, label: 'to buy trekking shoes you’ll use once a year' },
  { value: 750, label: 'to rent them for a 5-day trek instead' },
  { value: 675, label: 'that the owner earns from that one rental' },
];

export function WhySajha() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label} className="rounded-xl bg-ink-950 p-8 text-white">
          <p className="font-display text-4xl font-bold text-accent-300">
            <CountUp to={f.value} currency />
          </p>
          <p className="mt-3 text-ink-200">{f.label}</p>
        </div>
      ))}
      <p className="text-sm text-ink-500 md:col-span-3">
        Example: ₹150/day for 5 days, with a 10% platform fee. Every rental also keeps one more
        thing out of a landfill.
      </p>
    </div>
  );
}
