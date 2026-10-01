import { Star } from 'lucide-react';

/** Five stars, filled to the rating (rounded to the nearest whole star). */
export function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex" aria-label={`${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          style={{ width: size, height: size }}
          className={n <= full ? 'fill-sj-warning text-sj-warning' : 'text-sj-border'}
        />
      ))}
    </span>
  );
}
