import type { CSSProperties, ElementType } from 'react';

/**
 * Words fade in from a blur, one after another.
 * Adapted from React Bits "BlurText" (reactbits.dev, MIT + Commons Clause),
 * rebuilt with CSS animations so it runs without JavaScript: the text is in
 * the first paint (good for LCP) and `prefers-reduced-motion` turns it off.
 */
export function BlurText({
  text,
  as: Tag = 'span',
  className,
  delay = 0,
  stagger = 0.08,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const words = text.split(' ');
  return (
    <Tag className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className="blur-in inline-block"
            style={{ '--blur-delay': `${delay + i * stagger}s` } as CSSProperties}
          >
            {word}
            {i < words.length - 1 && ' '}
          </span>
        ))}
      </span>
    </Tag>
  );
}
