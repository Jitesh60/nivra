# @sajha/web

Nivra website (Next.js 16, Tailwind v4): the static marketing pages, plus the web app, where people who don't install the Android app can sign in, lend and borrow. Design notes: [docs/ARCHITECTURE.md §11](../../docs/ARCHITECTURE.md#11-marketing-site-architecture-appsweb).

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:3002 (the waitlist form needs the API on :3000)
```

## Pages

`/` (landing), `/how-it-works`, `/lend`, `/faq`, `/contact`, `/privacy`, `/terms`, `/delete-account`, `/blog` (posts in `src/content/blog/`, feed at `/blog/rss.xml`) and `/rent/[category]` (content in `src/content/rent-pages.ts`), plus `/sitemap.xml`, `/robots.txt` and generated Open Graph images. The Terms, Privacy and Delete-account pages are **drafts** marked for legal review before launch.

**Launch switch:** set `NEXT_PUBLIC_PLAY_STORE_URL` and/or `NEXT_PUBLIC_APP_STORE_URL` and rebuild. The waitlist sections become download buttons. Sentry is off unless `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` is set.

## Web app

Signing in, browsing, listing and borrowing, the same features as the Android app, all against the same API.

- **Sessions:** the API's tokens live only in httpOnly cookies (`src/lib/session.ts`). The browser never calls the API for signed-in work. Pages are server components, and changes go through server actions (`src/lib/api.ts`). `src/proxy.ts` guards private pages and refreshes the access token, the same way as `apps/admin`.
- **Uploads:** photos are shrunk in the browser (`src/lib/client-image.ts`). The server then uploads them through the API's presigned URLs (`src/lib/upload.ts`), so the storage bucket needs no CORS rules.
- **Environment:**
  - `SAJHA_API_URL`: the API, for server-side calls; defaults to `NEXT_PUBLIC_SAJHA_API_URL`.
  - `WEB_CLIENT_SECRET`: the API's value. It passes each visitor's IP on, so sign-in limits count per visitor, not per web server. Leave it empty locally.
- **Sign-in:** phone OTP. New accounts add a name, then an email: verify it now or skip for later. Listing, booking and chat need a verified email, and those buttons take people to verify it and back.
- **Pages:**
  - Public: `/explore` (feed, search, filters, Near me), `/item/[id]` (gallery, quote, reviews), `/u/[id]` (member reviews).
  - Signed in:
    - `/wishlist`, `/listings` and `/listings/new|[id]` (editor with a Leaflet pickup map)
    - `/bookings` and `/bookings/[id]`, with:
      - `share`, `documents/[shareId]` (watermarked viewer), `pay` (Razorpay)
      - `code`, `handover`, `return`
      - `dispute`, `respond`, `review`
    - `/documents`, `/earnings`, `/inbox` and `/inbox/[id]` (polling chat, offers), `/notifications`
    - `/requests`, `/saved-searches`, `/invite`, `/settings`, `/profile`
- **Live updates:** an open chat polls every 4 s; the unread badges poll `/unread` every 30 s. There's no socket, so tokens never reach the browser.
- **Private images:** ID documents stream through route handlers (`src/lib/private-image.ts`), never cached. Signed storage URLs stay on the server.

## Effects

| Where | What | Library |
|---|---|---|
| Hero background | Animated mesh gradient, static gradient fallback | Paper Shaders (Apache-2.0) |
| Headline | Words fade in from a blur (pure CSS) | React Bits "BlurText", recreated |
| Categories | Card light follows the pointer | React Bits "SpotlightCard", recreated |
| Why Nivra | Numbers count up on scroll | React Bits "CountUp", recreated |
| Hero button | Drifts toward the pointer | React Bits "Magnet", recreated |
| Buttons, tabs, loader | Glow border, sliding toggle, bouncing dots | uiverse.io-style |

All effects respect `prefers-reduced-motion`. The shader only runs on GPU-backed WebGL, see `src/components/effects/shader-hero-background.tsx`.

## Tests

```bash
pnpm build && pnpm test:e2e      # Playwright, desktop + mobile; the waitlist and app tests (e2e/app) need the API running with OTP_DEV_BYPASS_CODE=000000 (e2e/app/api.ts seeds users, listings and an Ops admin through it)
```
