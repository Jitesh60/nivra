import { cn } from '@/lib/utils';

/** A round photo, or the person's initials on the brand tint. */
export function Avatar({
  name,
  url,
  size = 36,
  className,
}: {
  name?: string | null;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  const initials =
    (name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- public storage URL, any host
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 rounded-full object-cover', className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-sj-primary-soft font-semibold text-sj-on-primary-soft',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  );
}
