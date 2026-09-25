import { useId } from 'react';
import { cn } from './cn';

/**
 * The Nivra mark: two people whose arms form a heart around a shared box.
 * Source artwork: packages/ui/brand/*.svg (DESIGN.md §2).
 *
 * - `icon`: the app-icon tile, cream mark on the green gradient (default)
 * - `cream`: a cream tile with the green mark, for dark backgrounds
 * - `mark`: no tile; `tone` picks a green (light UI) or cream (dark UI) mark
 */
export function LogoMark({
  variant = 'icon',
  tone = 'dark',
  className,
  title,
}: {
  variant?: 'icon' | 'cream' | 'mark';
  tone?: 'dark' | 'light';
  className?: string;
  /** Accessible name; decorative when omitted. */
  title?: string;
}) {
  const id = useId().replace(/:/g, '');
  const bg = `nv-bg-${id}`;
  const orange = `nv-or-${id}`;
  const cream = '#FBF8F2';
  const green = '#1E4D3A';
  const ink = variant === 'icon' || (variant === 'mark' && tone === 'light') ? cream : green;
  const paper = ink === cream ? green : cream;
  return (
    <svg
      viewBox={variant === 'mark' ? '30 38 140 130' : '0 0 200 200'}
      className={cn('size-8 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A6E52" />
          <stop offset="1" stopColor="#153A2B" />
        </linearGradient>
        <linearGradient id={orange} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7A062" />
          <stop offset="1" stopColor="#EC7A3A" />
        </linearGradient>
      </defs>
      {variant === 'icon' && <rect width="200" height="200" rx="48" fill={`url(#${bg})`} />}
      {variant === 'cream' && <rect width="200" height="200" rx="48" fill={cream} />}
      <circle cx="70" cy="58" r="15" fill={ink} />
      <circle cx="130" cy="58" r="15" fill={`url(#${orange})`} />
      <path
        d="M70 88 C38 90 40 128 100 158"
        fill="none"
        stroke={ink}
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M130 88 C162 90 160 128 100 158"
        fill="none"
        stroke={`url(#${orange})`}
        strokeWidth="16"
        strokeLinecap="round"
      />
      <rect x="80" y="92" width="40" height="36" rx="6" fill={ink} />
      <line x1="80" y1="104" x2="120" y2="104" stroke={paper} strokeWidth="3" />
      <rect x="95" y="92" width="10" height="12" fill="#F28C4E" />
    </svg>
  );
}

/**
 * The horizontal logo: the icon tile and the "nivra" wordmark, with an
 * optional suffix ("Admin") and the "Borrow · Lend · Share" tagline.
 * `inverse` is for dark backgrounds (cream tile, cream wordmark).
 */
export function Logo({
  inverse = false,
  suffix,
  tagline = false,
  className,
  markClassName,
}: {
  inverse?: boolean;
  suffix?: string;
  tagline?: boolean;
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark variant={inverse ? 'cream' : 'icon'} className={cn('size-9', markClassName)} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display text-[1.5rem] leading-none font-bold tracking-[-0.04em]',
            inverse ? 'text-[#FBF8F2]' : 'sj-wordmark',
          )}
        >
          nivra
          {suffix && (
            <span
              className={cn(
                'ml-1.5 align-middle font-sans text-caption font-semibold tracking-normal',
                inverse ? 'text-brand-200' : 'text-sj-primary',
              )}
            >
              {suffix}
            </span>
          )}
        </span>
        {tagline && (
          <span className="mt-1 text-[0.625rem] font-semibold tracking-[0.3em] text-[#EC7A3A] uppercase">
            Borrow · Lend · Share
          </span>
        )}
      </span>
    </span>
  );
}
