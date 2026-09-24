'use client';

import { useReducedMotion } from 'motion/react';
import { useRef, useState, type ReactNode } from 'react';

/**
 * Child drifts toward the pointer when it comes near.
 * Adapted from React Bits "Magnet" (reactbits.dev, MIT + Commons Clause).
 */
export function Magnet({
  children,
  strength = 6,
  padding = 60,
}: {
  children: ReactNode;
  strength?: number;
  padding?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reduceMotion = useReducedMotion();

  return (
    <div
      ref={ref}
      className="inline-block"
      style={{ padding, margin: -padding }}
      onPointerMove={(e) => {
        if (reduceMotion || e.pointerType !== 'mouse') return;
        const r = ref.current!.getBoundingClientRect();
        setOffset({
          x: (e.clientX - (r.left + r.width / 2)) / strength,
          y: (e.clientY - (r.top + r.height / 2)) / strength,
        });
      }}
      onPointerLeave={() => setOffset({ x: 0, y: 0 })}
    >
      <div
        className="transition-transform duration-300 ease-out"
        style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` }}
      >
        {children}
      </div>
    </div>
  );
}
