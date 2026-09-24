# Sajha — Delivery Phases

We build Sajha in small, reviewable phases. Each phase is delivered in the order **Backend → Mobile → Admin (→ Web)**, and each (sub-)phase lives on its **own branch** and ends with a **commit, a push and a PR into `main`**. See [PLAN §5](./PLAN.md#5-git-workflow).

Related: [PRD](./PRD.md) · [PLAN](./PLAN.md) · [ARCHITECTURE](./ARCHITECTURE.md)

---

## Roadmap

| Phase | Name | Branch | Apps |
|---|---|---|---|
| 0 | Foundation | `phase/0-foundation` | all |
| **1a** | **Auth — Backend** | `phase/1a-auth-backend` | api |
| **1b** | **Auth — Mobile** | `phase/1b-auth-mobile` | mobile |
| **1c** | **Auth — Admin** | `phase/1c-auth-admin` | admin |
| **1d** | **Marketing website v1** | `phase/1d-marketing-web` | web, api (waitlist) |
| 2a | Profiles & verification — API | `phase/2a-profiles-api` | api |
| 2b | Profiles & verification — Mobile | `phase/2b-profiles-mobile` | mobile |
| 2c | Profiles & verification — Admin | `phase/2c-profiles-admin` | admin |
| 3a | Listings & categories — API | `phase/3a-listings-api` | api |
| 3b | Listings & categories — Mobile | `phase/3b-listings-mobile` | mobile |
| 3c | Listings & categories — Admin | `phase/3c-listings-admin` | admin |
| 4a | Discovery & search — API | `phase/4a-discovery-api` | api |
| 4b | Discovery & search — Mobile | `phase/4b-discovery-mobile` | mobile |
| 5 | Chat, offers & notifications | `phase/5-chat-offers` | api, mobile, admin |
| 6 | Bookings & document sharing | `phase/6-bookings` | api, mobile, admin |
| 7 | Payments & payouts | `phase/7-payments` | api, mobile, admin |
| 8 | Handover, return, reviews & disputes | `phase/8-handover-reviews-disputes` | api, mobile, admin |
| 9 | Launch hardening & release | `phase/9-launch` | all |

Larger phases (3, 5, 6, 7, 8) may also be split into `-api`, `-mobile` and `-admin` sub-branches, like Phase 1, if the PR gets too big to review.

```mermaid
flowchart LR
  P0[0 Foundation] --> P1a[1a Auth BE]
  P1a --> P1b[1b Auth Mobile]
  P1a --> P1c[1c Auth Admin]
  P0 --> P1d[1d Marketing web]
  P1b --> P2[2 Profiles & verification]
  P1c --> P2
  P2 --> P3[3 Listings]
  P3 --> P4[4 Discovery]
  P3 --> P5[5 Chat & offers]
  P4 --> P6[6 Bookings & docs]
  P5 --> P6
  P6 --> P7[7 Payments]
  P7 --> P8[8 Handover, reviews, disputes]
  P8 --> P9[9 Launch]
```

## Definition of done (every phase)

- [ ] All acceptance criteria for the phase are met
- [ ] Lint, typecheck, tests and build are green locally and in CI
- [ ] New endpoints are documented in Swagger; `.env.example` is updated
- [ ] README or app README explains how to run the new work
- [ ] **Final commit made** (Conventional Commit message)
- [ ] **Branch pushed** with `git push -u origin phase/<…>` — **never to `main`**
- [ ] **PR opened into `main`**, with a summary, run steps and the checked acceptance list
- [ ] The next phase starts from `main` only after this PR is merged

---

## Phase 0 — Foundation
**Branch:** `phase/0-foundation`

**Scope**
- Monorepo: pnpm workspaces, Turborepo, shared `tsconfig` and `eslint-config`, Prettier, Husky + lint-staged, `.editorconfig`, `.nvmrc`
- `infra/docker-compose.yml`: PostGIS 16, Redis 7, SeaweedFS as local S3 (buckets created on start), Mailpit
- `apps/api`: NestJS skeleton, config module with env validation, Prisma set up with the first migration (extensions: `postgis`, `btree_gist`, `citext`), `/health` endpoint, pino logging, Swagger at `/docs`, global validation pipe and error filter, Vitest unit + e2e setup with Testcontainers
- `apps/mobile`: Flutter skeleton with Android flavors (dev/staging/prod) and `config/<env>.json` build config, folder structure, Riverpod, go_router, dio client, theme from design tokens, one sample shader compiled and rendered
- `apps/admin`, `apps/web`: Next.js skeletons with Tailwind; shadcn/ui initialised in admin
- `packages/design-tokens`: colours, typography and radii → a Tailwind preset and a generated Dart theme file
- GitHub Actions CI: JS job (lint, typecheck, test, build via Turbo) + Flutter job (analyze, test)
- Start external account setup: MSG91 DLT templates, Resend domain, Razorpay test account, Firebase project

**Acceptance criteria**
- `docker compose -f infra/docker-compose.yml up -d` then `pnpm dev` starts the API at `:3000` (the `/health` check returns ok), admin at `:3001` and web at `:3002`
- `flutter run --flavor dev --dart-define-from-file=config/dev.json` launches the app with a shader splash placeholder
- `pnpm lint && pnpm test && pnpm build` pass; the CI workflow is green on the PR

---

## Phase 1a — Auth: Backend
**Branch:** `phase/1a-auth-backend` · Design: [ARCHITECTURE §4](./ARCHITECTURE.md#4-authentication--authorization)

**Scope**
- Prisma models: `User`, `AdminUser`, `AdminRecoveryCode`, `Session` + `RefreshToken` (shared by both realms), `OtpChallenge`, `AuditLog`
- `providers/sms` (`Msg91SmsProvider`, `ConsoleSmsProvider`), `providers/email` (`ResendEmailProvider`, `MailpitEmailProvider`) plus email OTP template
- `otp` module: create and verify challenges, HMAC hashing, TTL, attempt limits, cooldown, Redis rate limits
- `auth` module: phone OTP login/signup, email OTP verify, JWT access token, rotating refresh token with reuse detection, logout, logout-all
- `users` module: `GET/PATCH /v1/me`, sessions list and revoke, account deletion request
- `admin-auth` module: login → mandatory TOTP setup/verify → tokens; recovery codes; lockout; `AdminJwtGuard` + `@Roles`
- `admin` module (Phase 1 part): manage admin users (Super Admin only); read-only app-user list
- `audit` module: log admin auth events and admin mutations
- `seed:admin` CLI to create the first Super Admin
- Swagger docs for every endpoint listed in ARCHITECTURE §4

**Acceptance criteria**
- [ ] Request OTP → the code appears in the console provider (dev) → verify returns tokens and `isNewUser: true` on first login and `false` afterwards
- [ ] Wrong code 5 times → `OTP_TOO_MANY_ATTEMPTS`; expired → `OTP_EXPIRED`; request again within 30s → `OTP_COOLDOWN`; the 6th request in an hour → `OTP_RATE_LIMITED`
- [ ] Email OTP sets `emailVerifiedAt`; an email already used by another user → `EMAIL_IN_USE`; the email arrives in Mailpit
- [ ] Refresh rotates tokens; reusing an old refresh token → `REFRESH_REUSED` and the whole family is revoked
- [ ] Logout invalidates the refresh token; logout-all kills every session
- [ ] A suspended user can't log in or refresh
- [ ] Admin: a correct password without 2FA gives no tokens; first login forces TOTP setup; 5 wrong passwords → locked out for 15 minutes; OPS can't reach Super Admin endpoints (`403`)
- [ ] OTP codes, tokens and phone numbers never appear in logs
- [ ] Unit tests for the OTP service, token service and guards; e2e tests for every endpoint above; coverage of the auth modules ≥ 80% (`pnpm --filter @sajha/api test:cov` enforces it in CI)

**Final commit:** `feat(auth-api): phone & email OTP, JWT refresh rotation, admin auth with TOTP & RBAC`

---

## Phase 1b — Auth: Mobile
**Branch:** `phase/1b-auth-mobile` (after 1a is merged)

**Screens**
1. **Splash**: animated shader background (GLSL aurora/gradient mesh) plus the logo animation; checks the stored session
2. **Onboarding**: 3 slides (Borrow / Lend / Trust) with `flutter_animate` transitions; skip option
3. **Phone entry**: fixed +91 prefix, 10-digit validation, terms and privacy consent checkbox, uiverse-style animated CTA
4. **OTP**: 6-box input with keyboard auto-fill (`AutofillHints.oneTimeCode`: iOS and Gboard suggest the code from the SMS), resend countdown (30s), error shake animation, attempts-left message. Android SMS Retriever (fully automatic fill) needs the app hash in the DLT SMS template, so it's added once MSG91 is live.
5. **Profile setup** (new users only): name
6. **Email entry → email OTP** (the same OTP widget); can be skipped for browsing, but it's required before listing or booking
7. **Home placeholder** with the verified badges shown and a logout button
8. **Settings → Active sessions** (list and revoke), **Logout**, **Logout all devices**, **Delete account**

**Technical scope**
- `features/auth` data, application and presentation layers; `AuthController` state machine
- `flutter_secure_storage` for the refresh token; access token in memory
- dio `AuthInterceptor` + `TokenManager` (single-flight refresh, retries the failed request, signs out when the server ends the session)
- go_router redirects: unknown → splash, unauthenticated → onboarding (first time) or phone, no name → name setup, email not verified → email step (skippable)
- Maps API error codes to friendly messages
- Stable device ID generated and persisted at first launch
- `effects/`: reusable `ShaderBackground` widget, `AnimatedGradientButton`, `OtpField`, loading shimmer

**Acceptance criteria**
- [ ] A new user completes phone → OTP → name → email → email OTP and lands on Home with both badges
- [ ] An existing user logs in with phone + OTP only
- [ ] Killing and reopening the app keeps the user logged in; after the access token expires, requests refresh silently
- [ ] A revoked session (from another device) sends the user to login on the next API call
- [ ] Every API error code shows a clear message; OTP auto-fill works on an Android device
- [ ] Shader background runs at 60fps on a mid-range Android device; reduced-motion settings disable animations
- [ ] Widget tests for the phone, OTP and email screens; unit tests for `AuthController` and the refresh interceptor; `flutter analyze` is clean

**Final commit:** `feat(mobile-auth): onboarding, phone & email OTP, session handling with shader UI`

---

## Phase 1c — Auth: Admin
**Branch:** `phase/1c-auth-admin` (after 1a is merged)

**Screens**
1. **Login**: email + password (subtle shader/uiverse background on this screen only)
2. **2FA setup** (first login): QR code, verify code, show and download recovery codes
3. **2FA verify** (later logins), with a "use a recovery code" option
4. **Dashboard shell**: sidebar (role-aware), top bar with the admin's name and role, logout
5. **Admins** (Super Admin): list, invite (email + role → temporary password shown once), change role, disable
6. **Users** (read-only): table of app users with search by phone or email, verification badges and created date
7. **My account**: change password, active sessions

**Technical scope**
- Server Functions for login, 2FA and admin actions set and clear httpOnly cookies; `proxy.ts` refreshes tokens before pages render; `/logout` route handler
- `proxy.ts` (Next.js 16's renamed Middleware) protects `(dashboard)` routes
- `@sajha/api-client` generated from the API's OpenAPI spec
- shadcn/ui forms (`useActionState` + server-side validation from the API) and server-rendered tables

**Acceptance criteria**
- [ ] A seeded Super Admin logs in, sets up TOTP, and reaches the dashboard
- [ ] No token is readable from JS (`document.cookie` doesn't contain it)
- [ ] An OPS admin doesn't see the "Admins" nav item and gets a 403 page on direct URL access
- [ ] The session survives a page reload; logout clears it
- [ ] Playwright test: login → 2FA (using a TOTP generated from a test secret) → dashboard → logout

**Final commit:** `feat(admin-auth): admin login with TOTP 2FA, RBAC shell, admin & user lists`

---

## Phase 1d — Marketing website v1
**Branch:** `phase/1d-marketing-web` (can run in parallel with 1b/1c after Phase 0)

**Scope**
- Landing page sections from [PRD §9](./PRD.md#9-marketing-website): Hero, How it works (Borrower/Lender tabs), Categories, Why Sajha, Trust & safety, Become a lender (earnings calculator), FAQ, Waitlist/Download, Footer
- **Effects:**
  - **Paper Shaders** (`@paper-design/shaders-react`, Apache-2.0): animated hero background, with a static gradient poster fallback. shaders.com was the original choice, but it needs a paid Pro/Team license for any public commercial site
  - **React Bits**: split/blur text headline, spotlight or tilted category cards, animated counters, magnet CTA button
  - **uiverse.io**: CTA buttons, toggles for the Borrower/Lender tab, loader on waitlist submit
- Pages: `/`, `/how-it-works`, `/lend`, `/faq`, `/privacy`, `/terms`, `/contact`
- SEO: metadata, Open Graph images, sitemap, robots.txt
- API: `waitlist` module with `POST /v1/waitlist` (email, city, role, utm; rate limited, honeypot); admin CSV export endpoint

**Acceptance criteria**
- [ ] Lighthouse mobile scores: Performance ≥ 85, Accessibility ≥ 95, SEO ≥ 95
- [ ] `prefers-reduced-motion` disables shaders and animations
- [ ] The waitlist form saves to the DB and shows success, and a duplicate email shows a friendly message
- [ ] Responsive from 360px to 1440px
- [ ] Playwright smoke test: page loads, waitlist submits

**Final commit:** `feat(web): marketing landing with shader hero, React Bits & uiverse effects, waitlist`

---

## Phase 2 — Profiles & verification
Delivered as three sub-phases, each with its own branch and PR. **Done when:** a user uploads an ID, an admin approves it, and the ID badge shows in the app; every document view appears in the audit log.

**Decisions:** the ID badge is earned by **any** admin-approved, non-expired document (college and employee IDs count). The profile stores the **city only**; GPS pickup location arrives with listings in Phase 3.

### 2a — API
**Branch:** `phase/2a-profiles-api`

- `profiles` (name, city, bio, avatar); `user_documents` vault (PENDING/APPROVED/REJECTED; one live document per type)
- Uploads: `POST /v1/uploads` presigned PUT to a `tmp/` key in the private bucket (the type and size are signed). The server finalises by checking magic bytes and re-encoding with sharp (EXIF/GPS stripped): avatar → 512 px WebP in the public bucket, document → JPEG in the private bucket
- `GET/PATCH /v1/me` returns `city`, `bio`, `avatarUrl` and `idVerified`; `PUT/DELETE /v1/me/avatar`; `/v1/me/documents` (list, add, 5-minute signed view, delete)
- Admin: `/v1/admin/documents` queue, view, approve and reject (SUPER_ADMIN, OPS); `GET /v1/admin/users/:id` detail; suspend, ban and reactivate (revokes sessions)
- Every upload, view and review is audited. `VerifiedGuard` / `@RequireVerified()` are ready for Phase 3 routes
- **Done when:** e2e against real Postgres, Redis and SeaweedFS covers presign → PUT → finalise, the document lifecycle and the badge, privacy and RBAC, and suspend/ban; coverage ≥ 80%; the OpenAPI client is regenerated

### 2b — Mobile
**Branch:** `phase/2b-profiles-mobile`

- Profile view and edit (avatar crop and upload, name, city, bio), badges row (Phone / Email / ID)
- "My documents": list with status and rejection reason, add flow with masked-Aadhaar guidance, view, delete
- Uploads go through `UploadClient`: a presigned PUT on a separate, token-free HTTP client
- **Done when:** widget tests cover the avatar and add-document flows, and the live contract test does a real upload

### 2c — Admin
**Branch:** `phase/2c-profiles-admin`

- Document review queue and review page (the image streams through the admin server, so the storage URL never reaches the browser; watermark; approve, or reject with a reason)
- User detail page (profile, badges, documents, sessions, activity) with suspend, ban and reactivate
- CI's browser e2e job runs real storage (SeaweedFS) and the OTP bypass, so the suite uploads through presigned URLs like the app does
- **Done when:** Playwright approves a document and the user's `idVerified` flips to true; SUPPORT gets 403 on documents

**Later:** purging rejected documents after 30 days (BullMQ jobs, Phase 5), `FLAG_SECURE` when lenders view documents (Phase 6), PDF documents.

## Phase 3 — Listings & categories
Delivered as three sub-phases, each with its own branch and PR. **Done when:** a lender publishes a listing with required docs, and it shows as LIVE after moderation.

**Decisions:**
- **Moderation:** a lender's **first** listing is reviewed by an admin. Once a lender has an approved listing, their later listings go LIVE immediately. Admins can unpublish anything.
- **Location:** OpenStreetMap (`flutter_map`) with a draggable pin from GPS. The tile server is configurable.
- **Weekly pricing:** a weekly discount % (0–50) for 7+ days.
- **Limits:**
  - ₹10–₹10,000 per day
  - deposit ₹0–₹50,000
  - 1–90 days
  - advance notice 0–7 days
  - 1–8 photos
- **Commission:** 10%, served by `GET /v1/config`.

### 3a — API
**Branch:** `phase/3a-listings-api`

- `categories` (admin-managed; 9 launch categories seeded). Public `GET /v1/categories`; admin create, edit, hide and reorder.
- `listings`:
  - draft → publish (PENDING or LIVE) → pause/unpause → delete
  - admin approve, reject, unpublish and change category
  - public `GET /v1/listings/:id` with an approximate location (~1 km)
- `listing_photos`: presigned upload (`LISTING_PHOTO`), re-encoded into a 1600 px WebP and a 480 px thumbnail WebP (synchronous; BullMQ comes in Phase 5)
- `availability_blocks` (inclusive date ranges) and `listing_required_docs`
- Exact address encrypted with AES-256-GCM (`ADDRESS_ENC_KEY`). `location geography(Point)` is kept in sync by a trigger, with a GIST index for Phase 4.
- `@RequireVerified()` on create and publish; everything audited
- **Done when:** e2e covers the moderation rule, the photos, blocks and docs, public privacy, and deletion; coverage ≥ 80%; the OpenAPI client is regenerated

### 3b — Mobile
**Branch:** `phase/3b-listings-mobile`

- Create/edit listing wizard: photos → details → pricing (earnings preview) → availability → location on the map → required docs → preview → publish
- "My listings": status, reasons, pause/unpause, edit, delete
- **Done when:** widget tests cover the wizard through "Sent for review", and the live contract test publishes a real listing

### 3c — Admin
**Branch:** `phase/3c-listings-admin`

- Listing moderation queue and detail: approve, reject, unpublish, change category
- Category management
- The user page lists the user's listings
- **Done when:** Playwright approves a first listing that then appears publicly, the lender's second listing goes live without review, and Support gets 403

## Phase 4 — Discovery & search
Delivered as two sub-phases, each with its own branch and PR. **Done when:** a borrower finds items within 5 km that are free on their dates, sorted by distance.

**Decisions:**
- **Guests can browse** home, search and listing detail; sign-in is asked for at save, chat and book.
- **Search area:** GPS, or a spot picked on the OpenStreetMap map. 5 km by default, 1–25 km.
- **"Popular this week":** views (one per viewer per day) + 3× wishlist saves over 7 days.
- **Distances** are rounded to 0.5 km, and anything under 1 km reads "< 1 km".
- **Rental days are inclusive:** pickup day to return day.
- **Recently viewed** is kept on the device.

### 4a — API
**Branch:** `phase/4a-discovery-api`

- `GET /v1/search`:
  - keywords: Postgres full text, `english` stemming, weighted title > brand/category > description
  - `lat`/`lng`/`radiusKm`: PostGIS `ST_DWithin` on the GIST index
  - dates: free of blocked dates, within min/max days and advance notice
  - filters: category, price range, condition, verified lenders only
  - sort by distance, relevance, price or newest
  - keyset cursor paging
- `GET /v1/home` (categories, near you, popular this week, newest), `GET /v1/listings?ids=` (cards), `GET /v1/listings/:id/quote`
- Wishlist: `/v1/me/favorites`. Listing views are counted on the public detail; guests are keyed by a salted hash, with no raw IP stored.
- An optional sign-in guard personalises public routes (saved flags); a stale token gets 401, never a silent guest.
- **Done when:** e2e covers radius and distance order, stemming, date availability, filters, paging, privacy (no coordinates), the wishlist, view dedupe and popular ranking, and quotes; coverage ≥ 80%.

### 4b — Mobile
**Branch:** `phase/4b-discovery-mobile`

- **Guest browsing:**
  - After onboarding, signed-out users land on home and can open home, search, the area picker and item pages (`/item/:id`); everything else still goes to sign-in.
  - Saving (and later chatting and booking) opens sign-in, then returns to the same item and finishes the save.
  - "Not now" goes back without saving.
- **Search area:** GPS or a spot on the map, with a 1–25 km radius. It's saved on the device.
- **Home:** search box, area, categories, Near you, Popular this week, Recently viewed (last 20 on the device), and New on Sajha. Signed-in users also get a verification prompt (only while something's missing) and the lending card.
- **Search:**
  - keywords, area chip, dates, a filters sheet (distance, category, price, condition, ID-verified lenders) and sort
  - results load as you scroll
  - an empty result offers to double the radius
- **Item page:**
  - the listing, the distance from your area, the lender (badges, member since) and how many people saved it
  - "Choose dates" greys out blocked days and days inside the notice period, then shows the quote: rent × days, weekly discount, service fee (free), deposit and total, or why the dates don't work
  - Chat and Request to book are shown but disabled until Phases 5–6
- **Wishlist:** saved items, newest first; items taken down since stay, marked. Hearts on any card or page stay in sync.
- **Done when:** widget tests cover the guest → sign-in-to-save flow, filters, the dates quote and the wishlist, and the live contract test searches the local API

## Phase 5 — Chat, offers & notifications
Delivered as three sub-phases, each with its own branch and PR. **Done when:** two devices chat in real time and negotiate an offer to an agreed deal; phone numbers in chat are masked.

**Decisions:**
- **Push:**
  - FCM behind a `PushProvider` interface.
  - `PUSH_PROVIDER=console` (the default) logs pushes. Real pushes start when Firebase credentials are added (`PUSH_PROVIDER=fcm`).
  - Live in-app updates work either way.
- **Accepting an offer locks the deal** (status ACCEPTED with the agreed dates and price). Phase 6's "Request to book" uses it; there is no bookings table yet.
- **Starting a chat** needs a verified phone and email.
  - One thread per borrower and listing; only the borrower starts it, on someone else's LIVE listing.
  - An existing chat continues if the listing is paused later.
- **Contact masking:**
  - Always on until a booking is confirmed (Phase 7 turns it off per pair).
  - Hidden: phone numbers (spaced, dashed, +91, spelled out), emails (including "at … dot com"), UPI IDs and WhatsApp/Telegram links.
  - The sender sees what they typed; the other person sees `•••`. Admins can read the original in a logged view.
- **Offers:**
  - Either side can offer dates plus a price per day. Rent is price × days, with no weekly discount on a negotiated price.
  - There is one open offer per chat (a new offer or a counter replaces it), and only the other person can accept or decline.
  - Accepting re-checks the listing's rules and needs it to be LIVE.
  - Offers expire after 48 h or at the end of the first rental day. Expiry is applied lazily; the job queue arrives in Phase 6.
- **Delivery:** messages are stored via REST (idempotent `clientId`); the socket only pushes events out and relays typing.
- **Blocks** stop messages and offers both ways. **Reports** cover users, listings and messages: one open report per target per reporter, 10 a day.

### 5a — API
**Branch:** `phase/5a-chat-api`

- **Chat:**
  - `POST /v1/conversations` gets or creates a chat.
  - `GET /v1/conversations` is the inbox; `GET /v1/me/unread` gives the badge count.
  - `GET` / `POST /v1/conversations/:id/messages` handle TEXT and IMAGE messages. `CHAT_IMAGE` uploads go to the private bucket and are served as 10-minute links.
  - `POST /v1/conversations/:id/read` marks messages read.
  - Limits: 30 messages a minute, 20 new chats a day.
- **Offers:** `POST /v1/conversations/:id/offers`, and `POST /v1/offers/:id/counter | accept | decline`.
- **Socket.IO `/ws`:**
  - The access token is checked at the handshake, and the socket disconnects when the token expires.
  - Events: `message:new` (each side gets its own view), `message:read`, `offer:updated`, `typing`.
  - A Redis adapter lets it run on several API instances.
- **Push:** `PUT` / `DELETE /v1/me/devices/push-token`, tied to the session.
  - A push goes out only when the recipient has no socket open.
  - Tokens FCM reports as dead, and tokens for signed-out sessions, are removed.
- **Safety:** `PUT` / `DELETE /v1/me/blocks/:userId`, `GET /v1/me/blocks`, `POST /v1/reports`.
- **Admin:** `GET /v1/admin/reports` and `GET /v1/admin/reports/:id`, `POST /v1/admin/reports/:id/resolve` (SUPER_ADMIN and OPS), and `GET /v1/admin/conversations/:id/messages` (the original text; every view is audited).
- **Done when:** e2e covers:
  - chat rules
  - masking per viewer
  - idempotent sends, paging and read receipts
  - private photos
  - the offer flow and its rules and expiry
  - blocks and reports
  - the admin queue and audited transcripts
  - push only when away, and token cleanup
  - the socket (a refused token, per-viewer messages, typing, read and offer events)

  Unit tests cover masking and the offer rules; coverage ≥ 80%.

### 5b — Mobile
**Branch:** `phase/5b-chat-mobile`

- **Inbox and chat:**
  - an inbox with unread badges
  - a chat with text, photos, offer cards (accept, counter, decline), typing indicators and read ticks
  - the masked-content note, and report and block
- **Item page:** "Chat" opens the conversation. Guests go through sign-in and come back; an unverified email gets a prompt.
- **Realtime and push:** a socket client that refreshes its token, and push behind a `PushService` (off until Firebase is configured).
  - The socket is open only while signed in and in the foreground. Coming back to the app refreshes the inbox and badge.
  - Firebase is initialised from `FIREBASE_*` in `config/<env>.json`, with no google-services files. Empty values mean no push.
- **Sending:** messages appear at once and can be retried if they fail. The `clientId` means a retry is stored once.
- **Reporting:** "Report this listing" on the item page; long-press a message to report it.
- **Done when:** widget tests cover chat and offers with a fake socket, and the live contract test chats over the real socket (open, send, get the message back live, make an offer, register for push).

### 5c — Admin
**Branch:** `phase/5c-chat-admin`

- **Reports queue** (`/reports`, every admin role): Open, Actioned and Dismissed tabs with paging. Each row shows what was reported, the reason, the reporter and when.
- **Report detail** (`/reports/[id]`):
  - The reporter's note and the target. A user or listing links to its page, where the suspend, ban and unpublish actions already live.
  - A reported message shows what the sender typed and what the other person saw (masked).
  - "View conversation (logged)" opens a read-only transcript with original text. The API records every view as `admin.conversation.view`, and the page says so.
- **Closing a report** (SUPER_ADMIN and OPS): Actioned or Dismissed, with a note for the record. Support can read but not close.
- **Done when:** Playwright covers a masked UPI ID and phone number reported by the borrower, read in its original form and closed by OPS, and SUPPORT viewing a report read-only.

## Phase 6 — Bookings & document sharing
Delivered in three parts, each with its own PR and green CI: **6a API → 6b Mobile → 6c Admin**. Payment capture is Phase 7.

**Done when:** a booking on a listing that requires documents goes accept → borrower shares an ID → lender approves → AWAITING_PAYMENT, and overlapping requests can't both reach AWAITING_PAYMENT.

**Decisions**
- **Two ways in:**
  - "Request to book" on the item page, at the listed price; the lender has 24 hours to accept or decline.
  - An offer accepted in chat creates a booking that is **already accepted** (both people agreed), at the agreed price.
- **Statuses in this phase:** REQUESTED → AWAITING_DOCS (if the listing asks for documents) → AWAITING_PAYMENT, or DECLINED / EXPIRED / CANCELLED. "Accepted" is an event in the timeline, not a status the booking stays in. CONFIRMED and later come with payment (Phase 7) and handover (Phase 8).
- **Timers**, each configurable through env, with EXPIRED when they run out:
  - lender reply: 24 h
  - borrower shares documents: 24 h
  - lender reviews them: 24 h
  - payment hold: 2 h (real in Phase 6: the dates free up again; the app says payment opens in the next update)

  No step runs past the end of the first rental day.
- **Holding dates:** a Postgres exclusion constraint holds the dates from AWAITING_PAYMENT on. Requests can overlap; the first to be held wins and the other gets `BOOKING_DATES_TAKEN`. Held dates count as unavailable in search, quotes, the public calendar, chat offers and new requests (lender blocks stay in their own table).
- **Limits:** one booking in progress per borrower and listing; 10 requests a day; verified phone and email; not your own listing; the listing must be LIVE.
- **Cancelling before payment** refunds nothing because nothing was paid:
  - The borrower can cancel until payment.
  - The lender declines a request, or cancels after accepting; that counts against them and admins see the count.
  - Admins can cancel any booking in progress, with a reason.

  The PRD refund tiers are a tested `refundFor()` ready for Phase 7.
- **Documents:**
  - The borrower picks one vault document per required document (pending or approved by Sajha; not rejected or expired). Matching: a government ID is Aadhaar, PAN, driving licence, passport or voter ID; an address proof is also accepted from those that carry an address.
  - The files are **copied** to `bookings/{id}/` in the private bucket, so the share doesn't depend on the vault.
  - The lender approves (→ AWAITING_PAYMENT) or rejects with a reason (→ DECLINED).
  - The lender views them through 5-minute links while the booking is in progress. Every view is logged, and the borrower sees who opened what and when.
  - Access ends when the booking closes, and a daily job deletes the copies 30 days later.
- **Chat stays the record:** each change posts a note in the booking's conversation.
- **Notifications:** an in-app list (the bell) plus push when the app isn't open. Push goes out for booking requested, accepted, declined, expired and cancelled. Documents requested, shared and approved are in-app only (PRD).
- **Guards:** a listing or account with bookings in progress can't be deleted (pausing a listing still works).

### 6a — API
**Branch:** `phase/6a-bookings-api`

- **Schema** (migration `20260925080000_bookings`): `bookings` (with the exclusion constraint and a one-open-per-borrower-and-listing index), `booking_events`, `booking_document_shares`, `document_access_logs`, `notifications`.
- **`modules/bookings`:**
  - Pure rules (`booking-rules.ts`): transitions, deadlines, `can` flags, refunds and document matching.
  - `BookingStateMachine`: the only writer of statuses. Each change runs in a transaction with `SELECT … FOR UPDATE` and writes an event row. After the commit it schedules the next timer, posts a note in the chat, sends `booking:updated` to both people, and notifies them.
  - `BookingsService` and `BookingDocumentsService`, plus the user and admin endpoints.
- **Jobs:** BullMQ `bookings` queue:
  - delayed `expire` jobs, which re-check the booking before acting
  - `sweep-expired` every 5 minutes, which catches lost jobs
  - `purge-shares` daily at 03:00 IST

  The worker runs in the API process (`JOBS_WORKER`).
- **Notifications:** `GET /v1/me/notifications`, `POST /v1/me/notifications/read`, `notifications` in `GET /v1/me/unread`, and the socket event `notification:new`.
- **Chat:** accepting an offer creates the booking, and `ConversationDto.openBookingId` links to it.
- **Done when:** e2e covers:
  - requests, accept, decline and cancel, with who can do what
  - the overlap guard, including a concurrent race
  - documents: share, mismatch, view logging, approve, reject, access ending and purge
  - each timer and the sweep
  - offer → booking
  - notifications, push and socket events
  - the delete guards
  - the admin list, detail and cancel (Support read-only)

  A manual run showed the real delayed expiry freeing held dates.

### 6b — Mobile
**Branch:** `phase/6b-bookings-mobile`

- **Request to book** from the item page:
  - A confirm sheet shows the breakdown and the documents asked for, and says "24 hours to reply".
  - Guests sign in and come back to the same dates.
  - An unverified email gets a prompt.
- **My bookings:** Borrowing and Lending tabs, each with In progress and Past.
- **Booking page:**
  - status, next step and countdown
  - price, documents and the timeline
  - a chat link
  - actions from the API's `can` flags: accept, decline (optional reason), share documents, approve, don't accept (reason), cancel (reason)
- **Sharing documents:** pick a matching vault document per requirement (Sajha-verified ones first), or add one, then agree to share for this booking only. The borrower sees each time the lender opened it.
- **Lender's viewer:** a 5-minute link, a watermark with the lender's name, the booking and the time, `FLAG_SECURE` on Android, and a blur while recording on iOS.
- **Notifications:** a bell with a live unread badge. The list marks items read and opens the booking.
- **Links in:** push taps and the chat's **Open booking** open the booking.
- **Done when:**
  - Widget tests cover:
    - request → accept → share → approve (borrower)
    - accept → secure view → approve (lender)
    - decline and cancel
    - guest `?book=1`
    - the email prompt
    - offer → Open booking
    - the bell
    - My bookings
    - a booking push tap
  - The live contract test requests, lists and cancels a booking on the real API and gets `booking:updated` over the socket.

### 6c — Admin
**Branch:** `phase/6c-bookings-admin`

- **`/bookings`** (every admin role):
  - Open (requested or waiting for documents), Awaiting payment and Closed tabs, newest first, with keyset paging.
  - A search box matches the listing title or the borrower's or lender's name or phone.
- **`/bookings/[id]`:**
  - the people, with links to their user pages, their phones, and the lender's count of cancellations after accepting
  - links to the listing and the logged conversation
  - the timeline, with who did each step and any note
  - the documents asked for and shared, with status, Sajha verification, access end or purge, and every view (who, when, IP); no images
  - the money breakdown
- **Cancel with a reason** (Super Admin and Ops): common reasons plus free text, after a confirm step. Both people are notified. Support reads only.
- **Done when:** Playwright covers:
  - a lender's ID-requiring listing approved by Ops
  - a request → accept → PAN shared → opened → approved → Awaiting payment
  - Ops finding the booking by search and tab, reading the timeline and document log, and cancelling it (it moves to Closed)
  - Support viewing a request without being able to cancel

## Phase 7 — Payments & payouts
Delivered in three parts, each with its own PR and green CI: **7a API → 7b Mobile → 7c Admin**.

**Done when:** in test mode, pay → CONFIRMED via the webhook, cancellation refunds follow the policy, and the ledger balances.

**Decisions**
- **Razorpay** sits behind a `PaymentProvider`:
  - `RazorpayProvider` covers orders with auto-capture, signature checks, refunds, and Route (linked accounts and transfers).
  - `FakePaymentProvider` is for development, tests and CI. It uses the same id shapes and the same HMAC signatures. A dev-only endpoint plays the checkout sheet and sends a signed webhook.
  - Staging and production must use Razorpay with real keys.
- **One payment** covers rent + fee + refundable deposit. The deposit is held in the ledger and refunded after the return (Phase 8) or on cancellation.
- **Confirmation:**
  - **The webhook is the source of truth.** The app's verify call (checkout signature) confirms at once, and both paths are idempotent: payment rows are locked, and each webhook event is stored once.
  - **A payment that arrives after the hold expired** (or after cancellation) is refunded in full automatically.
  - **Once a booking is CONFIRMED,** the borrower sees the exact pickup address and the chat stops masking contact details.
- **Cancelling a paid booking** (until handover):
  - **Borrower:** by the PRD tiers.
    - More than 48 h before pickup: everything back.
    - 24–48 h: half the rent and the deposit.
    - Under 24 h: the deposit only.
    - The lender is paid their share of any rent kept.
  - **Lender or Sajha:** everything back, and a lender cancellation counts against them.
  - `GET /v1/bookings/:id/cancel-preview` shows the refund first.
- **Payouts (Route):**
  - Lenders set up a linked account (bank account, IFSC, PAN; only the last 4 digits are kept).
  - At confirmation, rent less the 10% commission is transferred **on hold**. It's released after the return (Phase 8) and reversed on cancellation.
  - Without an active account, earnings wait (AWAITING_ACCOUNT) and go out when it activates.
- **Ledger:**
  - Double entry: every movement is a transaction whose debits equal its credits.
  - A deferred database trigger rejects an unbalanced transaction, and another makes the ledger append-only.
  - Accounts: GATEWAY, DEPOSIT_HELD, LENDER_PAYABLE, PLATFORM_REVENUE, GOODWILL (admin refunds).
- **Failures:** a provider call that fails is recorded (FAILED, with the reason), retried by a 5-minute sweep up to 5 times, and shown to admins. Admins can retry a failed transfer.

### 7a — API
**Branch:** `phase/7a-payments-api`

- **Schema** (migration `20260925120000_payments`): `payments`, `refunds`, `payout_accounts`, `transfers`, `ledger_entries` (with the balance and append-only triggers), `webhook_events`, and the booking event `PAID`.
- **Endpoints:**
  - Checkout and verify:
    - `POST /v1/bookings/:id/pay` (checkout: order, key and prefill)
    - `POST /v1/payments/verify`
    - `POST /v1/payments/webhook` (raw-body HMAC)
  - Borrower and lender:
    - `GET /v1/bookings/:id/cancel-preview`
    - `GET` / `PUT /v1/me/payout-account`
    - `GET /v1/me/earnings`
  - Development only: `POST /v1/dev/payments/:orderId/checkout`
  - Admin:
    - `/v1/admin/payments` (list, detail, refund)
    - `/v1/admin/payouts`, `/v1/admin/transfers/:id/retry`
    - `/v1/admin/ledger/summary`
- **The booking gains** `payment`, `pickupAddress` and `can.pay`. The admin bookings list gains a Confirmed tab.
- **Done when:** e2e with the fake provider covers:
  - verify first, then the webhook (and a duplicate)
  - the webhook alone, and bad signatures
  - a failed payment tried again
  - a late payment refunded
  - chat unmasking
  - each cancellation tier, plus lender and admin cancellations
  - transfers reversed, and the kept share paid
  - a failed refund retried by the sweep
  - payout setup, activation by webhook, and earnings
  - admin refunds (goodwill), retrying a transfer, and a balanced ledger

  Unit tests cover the postings and the signature scheme. A manual run on local infra went pay → webhook → confirmed → a transfer on hold → a 24–48 h cancellation → half the rent refunded, the transfer reversed and the kept share paid, with the ledger balanced.

### 7b — Mobile
**Branch:** `phase/7b-payments-mobile`

- **Pay** on a booking waiting for payment. It uses Razorpay checkout (`razorpay_flutter`), or a test sheet with the fake provider, then waits on a processing screen for the confirmation.
- **Confirmed booking:** the pickup address, the payment and refunds, and cancel with a refund preview.
- **Payouts:** a lender payout setup screen (bank, IFSC, PAN) and an Earnings screen.

**As built:**
- **Paying:** `PaymentGateway` (`core/payments/`) opens Razorpay Standard Checkout through `razorpay_flutter`. When the API answers `provider: fake`, a **test checkout** sheet (Pay, or simulate a failure) calls `POST /v1/dev/payments/:orderId/checkout` instead. Production builds never show it.
- **After checkout:** the processing screen (`/booking/:id/paying`) calls `/payments/verify` and waits for the booking to be confirmed.
  - If verify can't get through, the webhook still confirms it and the page updates live.
  - After 45 seconds it says it's taking longer, and the borrower can leave.
  - A failed payment shows the reason and **Try again**, which reuses the same order.
- **Booking page:**
  - **Pay ₹X** (from `can.pay`).
  - The pickup address card, for the borrower once confirmed.
  - The payment line (when, method) and each refund with its status.
  - A note for the lender that their share is held.
  - Cancelling a paid booking first shows the API's refund preview (`/cancel-preview`).
- **Profile → Earnings & payouts:** totals (held, paid out, waiting for a bank account) and a list per booking. Payouts has a bank form (account number twice, IFSC, PAN, address), then the account status. Only the last 4 digits are shown.
- **Chat:** needs no change. The API stops masking once confirmed, so the "hidden" note no longer shows.
- **Android:** R8 keep rules for Razorpay are in `proguard-rules.pro`.
- **API fix:** deleting an account now removes the payout details too.
- **Tests:**
  - 7 widget flows:
    - the test checkout → confirmed with the address
    - a failure, then retry
    - closing the checkout
    - the Razorpay SDK path, including a refused forged signature
    - verify offline with the webhook confirming
    - a cancel with a refund preview and the transfer reversed
    - lender earnings and payout setup through to activation
  - The live contract test covers payouts and the not-yet-payable errors.
  - An opt-in live payment test (`LIVE_LISTING_ID`, `LIVE_LENDER_PHONE`) does request → accept → a failed then a paid test checkout → verify → confirmed with the address → a full refund on cancel.

### 7c — Admin
**Branch:** `phase/7c-payments-admin`

- **Payments:** a list and detail (refunds, transfers, the booking's ledger lines), with a goodwill refund (Super Admin and Ops).
- **Payouts:** a list by status, with retry.
- **Ledger:** balances, a "Balanced" check and reconciliation counts.

**As built:**
- **Nav:** a **Payments** item for every role, with Payments · Payouts · Ledger tabs. Refund and Retry are for Super Admin and Ops only.
- **Payment detail:**
  - the charge breakdown and what's left to refund
  - refunds (kind, reason, who, status)
  - payouts to the lender, with Retry on a failed one
  - the booking's ledger lines
- **Goodwill refund:** an amount up to what's left, with a reason, after a confirm step.
- **Bookings:** a **Paid** tab (confirmed onwards), "Paid (confirmed)" in the timeline, and a link from each booking to its payment. For that link, the admin payments search now also accepts a booking id (API).
- **Ledger page:** balances per account, the Balanced badge, and checks for unbalanced transactions, captured payments with no ledger entry, and failed refunds and payouts.
- **Playwright** (`e2e/payments.spec.ts`, 3 tests):
  1. Paid through the test checkout: Ops sees the payment, the lender's share waiting for a bank account, 4 ledger lines, a balanced ledger and the payout listed.
  2. Ops refunds ₹150 after an amount that's too large is refused, and the ledger stays balanced.
  3. Support is read-only.

## Phase 8 — Handover, return, reviews & disputes
Delivered in three parts, each with its own PR and green CI: **8a API → 8b Mobile → 8c Admin**.

- **API:** handover and return codes (QR + 6-digit OTP), condition reports, rental reminders, late fees, claim window, payout release and deposit refund on COMPLETED, `reviews` (double-blind), `disputes`, `reports`
- **Mobile:** handover/return screens (show QR, scan QR, photo capture), late-return banner, rate and review screen, raise a dispute with evidence, report listing
- **Admin:** dispute workspace (timeline, condition photos side by side, chat excerpt, decision with a deposit capture amount), reports queue
- **Done when:** a full rental runs end to end in test mode: request → pay → handover → return → review → payout released and deposit refunded; a disputed rental is resolved by an admin with a partial capture

**Decisions** (confirmed with the product owner):
- **Deposit kept after a dispute:** it goes to the lender, as an unheld transfer. The rest is refunded.
- **No-show:** from the first rental day the lender marks it. It's treated as a borrower cancellation under 24 h: the deposit comes back and the lender keeps their rent share.
- **Codes:** scanned by camera QR, with a typed 6-digit fallback.

**Defaults:**
- The borrower shows the handover code and the lender confirms it with at least 2 photos, from the day before the start. At return it's the other way round.
- Late fee: 1× the daily rate per started day, capped at the deposit.
- Claim window: 24 h. A lender can report "not returned" from 2 days overdue.
- Reviews: within 14 days, published when both have written one or after 7 days.
- Admins can't cancel after handover.

### 8a — API
**Branch:** `phase/8a-rental-api`

- **What's built:**
  - `modules/rentals/`:
    - `HandoverService`: codes, handover, return, photos, no-show
    - `DisputesService`: open, respond, admin list/get/resolve
    - `ReviewsService`: double-blind, averages, public lists
    - `RemindersService`
    - the hourly `rentals` worker
  - New transitions in `booking-rules.ts`: `handOver`, `markReturned`, `noShow`, `openDispute`, `complete`, `resolveDispute`.
  - Completion runs on the returned booking's deadline, through the existing expiry job.
  - `PaymentsService.settle` on COMPLETED: post the kept deposit (`DEPOSIT_KEPT`), release the held rent, transfer the kept deposit, refund the rest (`DEPOSIT_RETURN`); idempotent and re-run by the sweep.
  - Ratings on profiles, listings, search cards and the lender summary.
  - `SmsProvider.sendOverdue`.
- **Migration `20260926090000_rentals`:**
  - `condition_reports`, `disputes`, `reviews`
  - the rental columns on bookings, ratings on profiles and listings, and `transfers.from_deposit`
  - checks on ratings, amounts and photo counts
- **Tests:**
  - Unit: the rental rules (windows, late days and fees across IST edges, `can` flags) and the settlement ledger.
  - e2e (`test/rentals.e2e-spec.ts`, 11 tests):
    - handover: codes, too early, photos required, lockout
    - no-show
    - late return → claim window → completion: rent released, late fee to the lender, deposit less the fee refunded, ledger balanced
    - reviews: double-blind, the 7-day publish, averages
    - disputes: validation, the borrower's reply, Support 403, an Ops partial keep of ₹600 of ₹1,000; a closed window; "not returned"
    - reminders: once a day, and overdue by SMS
- **Checks:** 143 e2e tests pass, with 92.1% statement and 79.8% branch coverage.

### 8b — Mobile
**Branch:** `phase/8b-rental-mobile`

- **Codes:**
  - The borrower (at handover) and the lender (at return) open **Show code**: a QR (`qr_flutter`) and the 6 digits in large type. It closes itself once the other person confirms.
  - The other person opens **Hand over** or **Return it**, scans the QR with the camera (`mobile_scanner`, behind the `CodeScanner` seam) or types the 6 digits, and adds 2–6 condition photos.
  - A QR for another booking is refused on the phone.
- **Booking page:**
  - What happens next, for each rental step.
  - A **late banner** when the item is due today or overdue, with the fee so far.
  - A countdown while the lender can still report a problem.
  - **Condition photos** by stage and person, opening a full-screen viewer.
  - The late fee line and the deposit refund.
  - **Report a problem** (lender): reason, amount capped at what's left, description, photos. Then **Give your side** (borrower), and Sajha's decision once it's made.
  - **Borrower didn't show up** (lender, from the first day).
  - **Rate {name}** after completion, with a double-blind note.
  - **Report {name}**, using the existing report sheet.
- **Ratings:** ★ average (count) on listing cards, the item page's lender tile and a Reviews section on the item page.
- **Platform:** the camera permission on Android, and the iOS camera string now mentions scanning codes.
- **Tests:**
  - 8 widget flows:
    - showing the code, which closes after the handover
    - handing over by scan, including a wrong QR and a wrong typed code
    - a late return with the banner and fee
    - a lender's claim
    - the borrower's reply and the outcome
    - no-show
    - double-blind reviews and the item rating
    - reporting a person
  - An opt-in live test covers handover and return with real codes and photos against the API. The chat offer in the live contract test now uses a random date, so reruns don't collide.

### 8c — Admin
**Branch:** `phase/8c-rental-admin`

- **Disputes** in the nav for every role. Settling is SUPER_ADMIN/OPS only, as the API enforces.
  - `/disputes`: Open and Settled tabs, with the listing, the reason, whether the borrower has replied, and the claim against the deposit.
  - `/disputes/[id]`, the workspace:
    - the lender's claim and evidence photos, and the borrower's reply and photos
    - **condition photos side by side**, handover next to return for each person
    - the **last 10 chat messages** (the logged transcript, shared with `/conversations/[id]`), with a link to the full conversation
    - the booking timeline
    - the deposit, late fee, claim and the most the lender can keep
  - **The decision:** the amount the lender keeps (quick picks: nothing, what they asked, the most allowed) and a note both people see. What the lender gets and what the borrower gets back are shown before a confirm step. After settling, the page shows the decision, who made it and a link to the payment.
- **Photos** are streamed by the `/bookings/[id]/photos/[n]` and `/disputes/[id]/photos/[n]` route handlers (add `?thumb=1` for the thumbnail). They read the signed link from the API, fetch the bytes on the server and return them with `no-store`, so storage URLs never reach the browser.
- **Booking detail** gains a Rental card (handed over, due back, returned, late fee, claim window, completed and deposit kept, or no-show) with a link to the dispute, plus the condition photos. The new timeline events have labels. The cancel form only shows while the API says the booking can be cancelled (before handover).
- **Payments:** the `DEPOSIT_RETURN` refund reads "Deposit back".
- **Tests** (`e2e/disputes.spec.ts`), with a full rental run through the API (pay, handover and return with codes and photos, a chat message, the lender's ₹800 claim and the borrower's reply):
  - Support can read the dispute but not settle it.
  - Ops sees the claim, reply and condition photos. Photos stream with `no-store`, and an out-of-range photo returns 404. Ops reads the chat excerpt, is refused more than the maximum, and keeps ₹600. The booking completes with the rental card and no cancel option, the borrower's ₹400 "Deposit back" refund is listed, and the ledger stays balanced.
  - The e2e helper now sends each app user's OTP requests from its own test IP (`X-Forwarded-For`, trusted from loopback), so the growing suite stays under the per-IP OTP limit.
  - Payouts being released after a claim window that runs out without a dispute is covered by the API e2e suite: it needs the 24-hour window to pass.

## Phase 9 — Launch hardening & release
Delivered in four parts, each with its own PR and green CI: **9a API → 9b Mobile → 9c Admin + Web → 9d Infra**.

- Admin analytics dashboard (signups, listings, bookings, GMV, disputes)
- Notification preferences; email templates polished
- Security review (OWASP ASVS L1 checklist), load test of the search and chat endpoints, backups and restore drill
- Crash reporting (Sentry / Crashlytics), app store assets, privacy nutrition labels, Play Store Data Safety form, account-deletion URL
- Production infrastructure, staging → production promotion, monitoring alerts
- Marketing site: switch the waitlist to download links, blog/SEO pages
- **Done when:** the apps are live on the Play Store (and the App Store), with production monitoring in place

**Decisions**
- **Hosting:** Railway for the API, the worker, Postgres and Redis; Vercel for admin and web; S3 stays on AWS (ap-south-1).
- **Crash reporting:** Sentry everywhere (API, admin, web, Flutter), off unless a DSN is set, with personal data scrubbed before sending.
- **Stores:** Phase 9 delivers a release-ready kit and a checklist; publishing needs the owner's Play Console and Apple Developer accounts, signing keys and a Mac.
- **Worker:** production runs the same image twice: web (`JOBS_WORKER=false`, public) and worker (`JOBS_WORKER=true`, no public domain). The worker keeps its Socket.IO server so timer-driven updates still reach open apps through the Redis adapter.

### 9a — API
**Branch:** `phase/9a-launch-api`

- **Notification preferences:** `GET/PUT /v1/me/notification-preferences` with push (bookings, chat, reminders), email (booking updates), SMS (return reminders) and marketing switches, stored in `notification_preferences` (no row = the defaults, everything on but marketing). In-app notifications, codes and security or legal messages always go out. `NotificationsService.notifyIfAway` checks the switch for the push's type; the overdue reminder skips the SMS when it's off. Account deletion removes the row.
- **Emails:**
  - One layout for all emails (HTML and text, brand colours, a "why you got this" footer and how to opt out).
  - Sent on payment (the borrower's receipt with the charge breakdown and pickup area; the lender's confirmation with their earnings), on a refund, when a dispute is decided (the split and Sajha's note, to both), and when an account is deleted (always).
  - Queued on BullMQ `email` (5 tries with backoff; the job id makes each email once-only) and sent by the worker, only to verified addresses and only with booking emails on.
- **Admin analytics:** `GET /v1/admin/analytics?days=7|30|90` (every admin role): totals and a daily series by IST day (signups, listings published, bookings requested / paid / completed / cancelled, GMV, Sajha's revenue from the ledger, refunds, disputes opened and settled), the previous period for comparison, a snapshot (active users, live listings, items out, open disputes) and the requested → paid → completed funnel. Cached for 5 minutes.
- **Sentry:** `@sentry/nestjs`, initialised before anything else (`src/instrument.ts`) only with `SENTRY_DSN`. 5xx errors and failed jobs on every queue are reported; `scrubEvent` removes bodies, cookies, auth headers and user details but the id, and masks phones, emails and codes. Release = `GIT_SHA`, which `/v1/health` also reports as `version`.
- **Hardening** ([SECURITY.md](SECURITY.md) has the ASVS L1 review):
  - Staging and production now also refuse console push, SMTP email, empty or `*` CORS, and Swagger (production).
  - Public reads (search, home, listings, reviews) are limited per IP (`PUBLIC_READ_LIMIT_PER_MIN`, default 120), answering 429 `RATE_LIMITED` with `Retry-After`.
  - Log redaction adds email, PAN, account number and the Razorpay signature.
  - `pnpm audit --prod --audit-level high` in CI; the two advisories found (mysql2 and deepmerge-ts, both via the Prisma CLI) are overridden to fixed versions.
- **Load tests** ([infra/load](../infra/load/README.md), results in [PERFORMANCE.md](PERFORMANCE.md)): k6 scripts for browsing and chat and a `seed:load` script (refuses any database not named for load or tests). On one shared 4-vCPU machine: browsing meets its targets up to about 75 requests a second with no errors up to about 95; chat meets them at 40 people sending about 16 messages a second. Unread counts got a partial index.
- **Tests:** unit tests for the preference mapping, the email templates, IST date ranges, the Sentry scrubber and the production env rules; e2e (`test/launch.e2e-spec.ts`) for the preference endpoints, pushes stopping when turned off, the receipt, lender and refund emails in Mailpit (and none when opted out), the account-deletion email, analytics after a paid booking (cache, periods, auth), the public read limit and the health version; the rentals suite adds the dispute emails and SMS reminders turned off.
