# @sajha/web

Sajha marketing website (Next.js 16, Tailwind v4, fully static). Design notes: [docs/ARCHITECTURE.md §11](../../docs/ARCHITECTURE.md#11-marketing-site-architecture-appsweb).

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:3002 (the waitlist form needs the API on :3000)
```

## Pages

`/` (landing), `/how-it-works`, `/lend`, `/faq`, `/contact`, `/privacy`, `/terms`, plus `/sitemap.xml`, `/robots.txt` and a generated Open Graph image. The Terms and Privacy pages are **drafts** marked for legal review before launch.

## Effects

| Where | What | Library |
|---|---|---|
| Hero background | Animated mesh gradient, static gradient fallback | Paper Shaders (Apache-2.0) |
| Headline | Words fade in from a blur (pure CSS) | React Bits "BlurText", recreated |
| Categories | Card light follows the pointer | React Bits "SpotlightCard", recreated |
| Why Sajha | Numbers count up on scroll | React Bits "CountUp", recreated |
| Hero button | Drifts toward the pointer | React Bits "Magnet", recreated |
| Buttons, tabs, loader | Glow border, sliding toggle, bouncing dots | uiverse.io-style |

All effects respect `prefers-reduced-motion`. The shader only runs on GPU-backed WebGL, see `src/components/effects/shader-hero-background.tsx`.

## Tests

```bash
pnpm build && pnpm test:e2e      # Playwright, desktop + mobile; waitlist tests need the API running
```
