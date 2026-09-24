'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

// Paper Shaders (Apache-2.0), loaded only in the browser and only when needed.
const MeshGradient = dynamic(
  () => import('@paper-design/shaders-react').then((m) => m.MeshGradient),
  { ssr: false },
);

const COLORS = ['#062722', '#0F6A57', '#1DA482', '#F57B0B', '#105447'];

/**
 * Only animate when it will be smooth and cheap: GPU-backed WebGL, no Data
 * Saver, and not a very low-memory device. Software renderers (SwiftShader,
 * llvmpipe) run shaders on the CPU and would block the main thread.
 */
function shouldAnimate(): boolean {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !/swiftshader|llvmpipe|software|basic render/i.test(renderer);
  } catch {
    return false;
  }
}

/**
 * Animated mesh-gradient hero background.
 *
 * A static CSS gradient in the same colours paints first (fast LCP, and the
 * fallback for reduced motion or no WebGL). The shader loads after the page
 * is idle and fades in on top.
 */
export function ShaderHeroBackground() {
  const reduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  // Pause the animation while the hero is scrolled out of view.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? true),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduceMotion || !shouldAnimate()) return;
    const start = () => setEnabled(true);
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 600);
    return () => clearTimeout(id);
  }, [reduceMotion]);

  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [enabled]);

  return (
    <div ref={rootRef} aria-hidden className="absolute inset-0 -z-10 overflow-hidden bg-ink-950">
      <div
        data-testid="hero-poster"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,var(--color-brand-600),transparent_55%),radial-gradient(ellipse_at_85%_75%,var(--color-accent-600),transparent_50%),radial-gradient(ellipse_at_60%_10%,var(--color-brand-400),transparent_40%)] opacity-80"
      />
      {enabled && (
        <div
          data-testid="hero-shader"
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: visible ? 0.9 : 0 }}
        >
          <MeshGradient
            colors={COLORS}
            distortion={0.8}
            swirl={0.35}
            speed={onScreen ? 0.25 : 0}
            minPixelRatio={1}
            maxPixelCount={1280 * 800}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
      {/* Keeps text readable over the brightest parts of the gradient. */}
      <div className="absolute inset-0 bg-gradient-to-b from-ink-950/30 via-ink-950/10 to-ink-950/60" />
    </div>
  );
}
