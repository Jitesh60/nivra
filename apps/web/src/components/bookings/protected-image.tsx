'use client';

/**
 * An ID document with the viewer's name tiled over it. Right-click, drag and
 * selection are off; browsers can't block screenshots, so the watermark ties
 * any copy to the person who viewed it.
 */
export function ProtectedImage({
  src,
  alt,
  watermark,
}: {
  src: string;
  alt: string;
  watermark: string;
}) {
  return (
    <figure
      className="relative overflow-hidden rounded-lg border border-sj-border bg-sj-surface-muted select-none"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- streamed private image */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="pointer-events-none w-full object-contain"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden"
      >
        <div className="grid -rotate-[24deg] gap-10 text-center text-sm font-semibold whitespace-nowrap text-ink-950/25">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i}>
              {watermark} &nbsp;&nbsp; {watermark}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="sr-only">{alt}</figcaption>
    </figure>
  );
}
