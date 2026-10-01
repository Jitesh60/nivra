'use client';

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';
import { DOCK, isActive, type DockItem } from '@/lib/app-nav';
import { cn } from '@/lib/utils';
import { Avatar } from './avatar';
import { MeSheet } from './me-sheet';
import { useUnread } from './unread';

const BASE = 44;
const ZOOM = 62;
const REACH = 140;

/**
 * The app's navigation: a floating dock at the bottom on every screen.
 * Icons grow toward the mouse on desktop.
 * Adapted from Magic UI "Dock" (magicui.design, MIT).
 */
export function Dock({ name, avatarUrl }: { name?: string | null; avatarUrl?: string | null }) {
  const mouseX = useMotionValue(Infinity);
  const reduceMotion = useReducedMotion();
  const [meOpen, setMeOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <nav
        aria-label="App"
        data-dock
        onPointerMove={(e) => {
          if (!reduceMotion && e.pointerType === 'mouse') mouseX.set(e.clientX);
        }}
        onPointerLeave={() => mouseX.set(Infinity)}
        className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 mx-auto flex max-w-xl items-end justify-between gap-1 rounded-3xl border border-white/60 bg-sj-surface/80 px-2 pt-2 pb-1.5 shadow-[0_12px_40px_-12px_rgb(15_23_42/0.35)] ring-1 ring-sj-border/60 backdrop-blur-xl sm:inset-x-0 sm:w-fit sm:gap-2 sm:px-3 sm:pb-2"
      >
        {DOCK.map((item) => (
          <DockLink key={item.href} item={item} mouseX={mouseX} active={isActive(pathname, item)} />
        ))}
        <DockSlot mouseX={mouseX} label="Me" active={meOpen}>
          {(size) => (
            <button
              type="button"
              aria-label="Me"
              aria-haspopup="dialog"
              aria-expanded={meOpen}
              onClick={() => setMeOpen(true)}
              className="grid size-full place-items-center rounded-2xl"
            >
              <motion.span
                style={{ width: size, height: size }}
                className="grid place-items-center"
              >
                <Avatar name={name} url={avatarUrl} size={28} />
              </motion.span>
            </button>
          )}
        </DockSlot>
      </nav>
      <MeSheet open={meOpen} onClose={() => setMeOpen(false)} name={name} avatarUrl={avatarUrl} />
    </>
  );
}

function DockLink({
  item,
  mouseX,
  active,
}: {
  item: DockItem;
  mouseX: MotionValue<number>;
  active: boolean;
}) {
  const badge = useUnread(item.badgeKey);
  const count = badge && badge > 0 ? (badge > 99 ? '99+' : String(badge)) : null;
  const Icon = item.icon;
  return (
    <DockSlot mouseX={mouseX} label={item.label} active={active} primary={item.primary}>
      {(size) => (
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={item.primary ? 'List an item' : item.label}
          className={cn(
            'relative grid size-full place-items-center rounded-2xl transition-colors',
            item.primary
              ? 'dock-primary text-white'
              : active
                ? 'text-sj-primary'
                : 'text-sj-muted-foreground hover:text-sj-foreground',
          )}
        >
          <motion.span
            style={{ width: size, height: size }}
            className="relative grid place-items-center [&_svg]:size-[55%]"
          >
            <Icon strokeWidth={item.primary ? 2.6 : 2} />
            {count && (
              <span
                data-testid={`badge-${item.badgeKey}`}
                className="absolute top-0 right-0 min-w-4 translate-x-1/3 -translate-y-1/4 rounded-full bg-sj-accent px-1 text-center text-[10px] leading-4 font-bold text-sj-on-accent ring-2 ring-sj-surface"
              >
                {count}
              </span>
            )}
          </motion.span>
        </Link>
      )}
    </DockSlot>
  );
}

/**
 * One dock position: magnifies with the mouse, shows a tooltip on desktop
 * and a small label on phones, and a dot under the current section.
 */
function DockSlot({
  mouseX,
  label,
  active,
  primary,
  children,
}: {
  mouseX: MotionValue<number>;
  label: string;
  active: boolean;
  primary?: boolean;
  children: (size: MotionValue<number>) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    return r ? x - (r.left + r.width / 2) : Infinity;
  });
  const target = useTransform(distance, [-REACH, 0, REACH], [BASE, ZOOM, BASE]);
  const size = useSpring(target, { mass: 0.1, stiffness: 170, damping: 14 });

  return (
    <div className="group relative flex min-w-0 flex-1 flex-col items-center sm:flex-none">
      <span
        aria-hidden
        className="pointer-events-none absolute -top-9 hidden rounded-md bg-ink-950 px-2 py-1 text-caption font-semibold whitespace-nowrap text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 sm:block"
      >
        {label}
      </span>
      <motion.div
        ref={ref}
        style={{ width: size, height: size }}
        className={cn(
          'grid place-items-center',
          primary && '-mt-3 sm:mt-0',
          active && !primary && 'rounded-2xl bg-sj-primary-soft',
        )}
      >
        {children(size)}
      </motion.div>
      <span
        aria-hidden
        className={cn(
          'mt-0.5 text-[10.5px] leading-none font-semibold sm:hidden',
          active ? 'text-sj-primary' : 'text-sj-muted-foreground',
        )}
      >
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          'mt-1 hidden size-1 rounded-full bg-sj-primary transition-opacity sm:block',
          active ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
}
