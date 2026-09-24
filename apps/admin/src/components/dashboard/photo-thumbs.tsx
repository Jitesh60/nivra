/** Thumbnails that open the full photo in a new tab (served through our own route). */
export function PhotoThumbs({
  base,
  from,
  count,
  label,
  testId,
}: {
  /** e.g. /bookings/<id>/photos */
  base: string;
  /** Index of the first photo in [base]'s list. */
  from: number;
  count: number;
  label: string;
  testId: string;
}) {
  if (count === 0) return <p className="text-sm text-muted-foreground">No photos.</p>;
  return (
    <ul className="flex flex-wrap gap-2" aria-label={label}>
      {Array.from({ length: count }, (_, i) => from + i).map((n, i) => (
        <li key={n}>
          <a href={`${base}/${n}`} target="_blank" rel="noreferrer" data-testid={testId}>
            {/* eslint-disable-next-line @next/next/no-img-element -- streamed, never cached */}
            <img
              src={`${base}/${n}?thumb=1`}
              alt={`${label} ${i + 1}`}
              className="size-24 rounded-md border object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
