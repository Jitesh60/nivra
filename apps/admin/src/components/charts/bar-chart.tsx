import { dayLabel } from '@/lib/analytics';

/**
 * A single-series daily bar chart in inline SVG: thin bars with rounded tops
 * on a baseline, a recessive max gridline, first/last day labels, a hover
 * tooltip per bar (with a hit area taller than the bar) and a table view for
 * screen readers. The title names the series, so there's no legend.
 */
export function BarChart({
  title,
  points,
  format = (n) => n.toLocaleString('en-IN'),
  testId,
}: {
  title: string;
  points: { date: string; value: number }[];
  format?: (n: number) => string;
  testId?: string;
}) {
  const W = 640;
  const H = 160;
  const top = 18;
  const bottom = 22;
  const plot = H - top - bottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  const slot = W / Math.max(1, points.length);
  const bar = Math.max(2, Math.min(18, slot - 2));
  const total = points.reduce((sum, p) => sum + p.value, 0);

  return (
    <figure className="grid gap-2" data-testid={testId}>
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-muted-foreground">{format(total)} in total</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full"
        role="img"
        aria-label={`${title}: ${format(total)} over ${points.length} days, peak ${format(max)} a day`}
      >
        <line
          x1={0}
          x2={W}
          y1={top}
          y2={top}
          className="stroke-border"
          strokeDasharray="2 4"
          strokeWidth={1}
        />
        <text x={0} y={top - 6} className="fill-muted-foreground text-[11px]">
          {format(max)}
        </text>
        <line x1={0} x2={W} y1={top + plot} y2={top + plot} className="stroke-border" />
        {points.map((p, i) => {
          const h = p.value === 0 ? 0 : Math.max(2, (p.value / max) * plot);
          const x = i * slot + (slot - bar) / 2;
          const y = top + plot - h;
          const r = Math.min(4, bar / 2, h);
          return (
            <g key={p.date} className="group">
              <title>{`${dayLabel(p.date)}: ${format(p.value)}`}</title>
              <rect x={i * slot} y={top} width={slot} height={plot} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${top + plot} V${y + r} Q${x},${y} ${x + r},${y} H${x + bar - r} Q${x + bar},${y} ${x + bar},${y + r} V${top + plot} Z`}
                  className="fill-chart-1 opacity-90 group-hover:opacity-100"
                />
              )}
            </g>
          );
        })}
        {points.length > 0 && (
          <>
            <text x={0} y={H - 6} className="fill-muted-foreground text-[11px]">
              {dayLabel(points[0]!.date)}
            </text>
            <text x={W} y={H - 6} textAnchor="end" className="fill-muted-foreground text-[11px]">
              {dayLabel(points[points.length - 1]!.date)}
            </text>
          </>
        )}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{dayLabel(p.date)}</td>
              <td>{format(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
