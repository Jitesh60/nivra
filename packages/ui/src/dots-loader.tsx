import { cn } from './cn';

/** Three bouncing dots. Inspired by uiverse.io loaders (MIT). */
export function DotsLoader({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-flex items-center gap-1', className)}
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="size-1.5 rounded-full bg-current motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
