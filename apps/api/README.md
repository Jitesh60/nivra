# @sajha/api

NestJS backend for Sajha. Design: [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).

## Run locally

```bash
pnpm infra:up                     # from the repo root
cp .env.example .env
pnpm prisma:deploy                # apply migrations
pnpm dev                          # http://localhost:3000 (watch mode)
```

- Health: `GET /v1/health` (database + Redis), `GET /v1/health/live` (process only)
- Swagger UI: `/docs`, OpenAPI JSON: `/docs/openapi.json` (when `SWAGGER_ENABLED=true`)

## Auth (Phase 1a)

- **App users:** phone OTP sign-in → email OTP verification. Locally, `SMS_PROVIDER=console` prints the code in the API log and emails land in Mailpit (http://localhost:8025).
- **Admins:** create the first Super Admin, then sign in with password + authenticator app:

  ```bash
  pnpm seed:admin -- --email you@sajha.app --name "Your Name"   # prints a temporary password
  ```

  Flow: `POST /v1/admin/auth/login` → `POST /v1/admin/auth/2fa/setup` (first time: scan the QR) → `POST /v1/admin/auth/2fa/verify` → change the temporary password with `POST /v1/admin/me/password`.
- Design and error codes: [docs/ARCHITECTURE.md §4](../../docs/ARCHITECTURE.md#4-authentication--authorization).

## Profiles, uploads & documents (Phase 2a)

- Storage is S3-compatible (SeaweedFS locally at http://localhost:9000; `pnpm infra:up` creates both buckets). Configure it with the `S3_*` variables in `.env.example`.
- Uploads: `POST /v1/uploads` → PUT the bytes to the returned URL with the returned headers → pass the `key` to `PUT /v1/me/avatar` or `POST /v1/me/documents`. The API re-encodes every image (EXIF stripped).
- Admin review: `/v1/admin/documents` (SUPER_ADMIN, OPS); user detail and suspend/ban/reactivate under `/v1/admin/users/:id`.
- Design: [docs/ARCHITECTURE.md §8](../../docs/ARCHITECTURE.md#8-files--the-document-vault).

## Listings & categories (Phase 3a)

- `GET /v1/categories` and `GET /v1/config` (marketplace rules: commission, price and deposit limits) are public.
- Lender flow (needs a verified phone and email): `POST /v1/me/listings` (draft) → `POST /v1/uploads` (purpose `LISTING_PHOTO`) + `POST /v1/me/listings/:id/photos` → optional `PUT …/blocks` and `PUT …/required-docs` → `POST …/publish`. A lender's first listing goes to review; after one approval, later listings go live immediately.
- Admin: `/v1/admin/listings` (queue, approve, reject, unpublish, change category) and `/v1/admin/categories`.
- Set `ADDRESS_ENC_KEY` (32 bytes, base64) in every environment: it encrypts exact pickup addresses.
- Rules and limits: `src/modules/listings/listing-rules.ts` (the database CHECK constraints match). Design: [docs/ARCHITECTURE.md §3.3](../../docs/ARCHITECTURE.md#33-phase-3-tables-built-in-phase-3a).

## Discovery (Phase 4a)

- Public, and personalised when signed in:
  - `GET /v1/search?q=&lat=&lng=&radiusKm=&startDate=&endDate=&categoryId=&minPricePaise=&maxPricePaise=&condition=&verifiedLendersOnly=&sort=&cursor=`
  - `GET /v1/home?lat=&lng=`
  - `GET /v1/listings?ids=` (cards)
  - `GET /v1/listings/:id` (counts a view)
  - `GET /v1/listings/:id/quote?startDate=&endDate=`
- Wishlist (signed in): `GET /v1/me/favorites`, `PUT` / `DELETE /v1/me/favorites/:listingId`.
- Design: [docs/ARCHITECTURE.md §3.4](../../docs/ARCHITECTURE.md#34-phase-4-tables-and-search-built-in-phase-4a).

## Chat, offers & safety (Phase 5a)

- **Chat** (verified phone and email to start):
  - `POST /v1/conversations {listingId}`, `GET /v1/conversations`, `GET /v1/me/unread`
  - `GET` / `POST /v1/conversations/:id/messages` (TEXT, or IMAGE via a `CHAT_IMAGE` upload)
  - `POST /v1/conversations/:id/read`
- **Offers:** `POST /v1/conversations/:id/offers`, `POST /v1/offers/:id/counter | accept | decline`.
- **Live updates:** Socket.IO at `ws://localhost:3000/ws` with `auth: { token: <access token> }`. Events: `message:new`, `message:read`, `offer:updated`, `typing`.
- **Push:** `PUT` / `DELETE /v1/me/devices/push-token`. Locally `PUSH_PROVIDER=console` logs pushes. For real pushes, set:
  - `PUSH_PROVIDER=fcm`
  - `FCM_PROJECT_ID`
  - `FCM_SERVICE_ACCOUNT_JSON`: the Firebase service account key on one line
- **Safety:** `PUT` / `DELETE /v1/me/blocks/:userId`, `GET /v1/me/blocks`, `POST /v1/reports`.
- **Admin:**
  - `/v1/admin/reports` (resolve: SUPER_ADMIN and OPS)
  - `/v1/admin/conversations/:id/messages`: the original text, with every view audited
- Design: [docs/ARCHITECTURE.md §7](../../docs/ARCHITECTURE.md#7-chat--realtime-phase-5a).

## Bookings & document sharing (Phase 6a)

- **Bookings** (verified phone and email to request):
  - `POST /v1/bookings {listingId, startDate, endDate}`
  - `GET /v1/bookings?role=BORROWER|LENDER&scope=OPEN|PAST`
  - `GET /v1/bookings/:id` (timeline, documents, and `can` flags for buttons)
  - `POST /v1/bookings/:id/accept | decline | cancel`
- An offer accepted in chat creates the booking itself. `ConversationDto.openBookingId` links to it.
- **Documents:**
  - `POST /v1/bookings/:id/documents` (borrower shares from the vault)
  - `POST /v1/bookings/:id/documents/approve | reject` (lender)
  - `GET /v1/bookings/:id/documents/:shareId/view` (lender; a 5-minute link; every view is logged)
- **Notifications:** `GET /v1/me/notifications`, `POST /v1/me/notifications/read`. Socket events: `booking:updated` and `notification:new`.
- **Admin:** `/v1/admin/bookings` (cancel: SUPER_ADMIN and OPS).
- **Background jobs:** BullMQ on `REDIS_URL`, queue `bookings`: step expiry, a 5-minute sweep, and a daily purge of shared copies. The worker runs in the API process; set `JOBS_WORKER=false` to run the API without it.
  - Windows: `BOOKING_REQUEST_TTL_MIN` (1440), `BOOKING_DOCS_TTL_MIN` (1440), `BOOKING_PAYMENT_TTL_MIN` (120), `SHARE_RETENTION_DAYS` (30).
  - To watch an expiry locally, start the API with `BOOKING_PAYMENT_TTL_MIN=1`.
- Design: [docs/ARCHITECTURE.md §5](../../docs/ARCHITECTURE.md#5-booking-lifecycle) and §8.

## Payments & payouts (Phase 7a)

- **Locally** everything runs on the fake Razorpay (`PAYMENT_PROVIDER=fake`):
  - `POST /v1/bookings/:id/pay` returns an order.
  - `POST /v1/dev/payments/:orderId/checkout {outcome: success|failure, webhook: now|later|never}` plays the checkout sheet. It returns what Razorpay's checkout would (`paymentId`, `signature`) and sends the signed webhook.
- **Razorpay test mode:**
  1. Set `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID` (`rzp_test_…`) and `RAZORPAY_KEY_SECRET`.
  2. Add a webhook in the Dashboard pointing at `https://<api>/v1/payments/webhook` with the events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`, `transfer.failed` and `account.*`. Put its secret in `RAZORPAY_WEBHOOK_SECRET`.
  3. **Route** must be enabled on the account for lender payouts.
- **Endpoints:**
  - `POST /v1/payments/verify`
  - `GET /v1/bookings/:id/cancel-preview`
  - `GET` / `PUT /v1/me/payout-account`
  - `GET /v1/me/earnings`
  - Admin: `/v1/admin/payments`, `/v1/admin/payouts`, `/v1/admin/ledger/summary`
- A `payments` job (BullMQ, every 5 minutes) retries failed refunds and transfers and refunds any cancelled paid booking that was missed.
- Design: [docs/ARCHITECTURE.md §6](../../docs/ARCHITECTURE.md#6-payments--payouts-razorpay).

## Handover, return, disputes & reviews (Phase 8a)

- **Handover:** the borrower shows the code from `GET /v1/bookings/:id/code`. The lender then sends `POST /v1/bookings/:id/handover {code, photoKeys}`, with 2–6 uploads of purpose `CONDITION_PHOTO`.
- **Return:** the other way round (`POST …/return`). A late return costs 1× the daily rate per day, taken from the deposit.
- **Other endpoints:**
  - `POST …/photos` (more condition photos)
  - `POST …/no-show`
  - `POST …/dispute` and `POST …/dispute/response`
  - `POST …/review`
  - Public: `GET /v1/users/:id/reviews`, `GET /v1/listings/:id/reviews`
  - Admin: `GET /v1/admin/disputes[/:id]` and `POST /v1/admin/disputes/:id/resolve` (Super Admin, Ops)
- **After the return:** the lender has 24 h to report a problem. Then (or after an admin's decision) the booking completes: the held rent is released, the lender gets any deposit they keep, and the rest is refunded.
- **Jobs:** an hourly `rentals` job sends reminders (pickup, return, due today, overdue) and publishes one-sided reviews after 7 days.
- **Overdue SMS** need `MSG91_OVERDUE_TEMPLATE_ID` (a DLT template with `##item##` and `##days##`) when `SMS_PROVIDER=msg91`; without it they're skipped.
- Design: [docs/ARCHITECTURE.md §5](../../docs/ARCHITECTURE.md#5-booking-lifecycle).

## Launch hardening (Phase 9a)

| Endpoint | What |
|---|---|
| `GET/PUT /v1/me/notification-preferences` | Push (bookings, chat, reminders), email (booking updates), SMS (return reminders), marketing |
| `GET /v1/admin/analytics?days=7\|30\|90` | Dashboard numbers by IST day with the previous period, a snapshot and the booking funnel (all admin roles; cached 5 minutes) |

- Emails (receipts, refunds, dispute decisions, account deletion) go through the `email` queue; the job worker sends them. Locally they land in Mailpit (http://localhost:8025).
- `SENTRY_DSN` turns on error reporting (scrubbed of personal data); `GIT_SHA` is shown by `/v1/health`.
- `PUBLIC_READ_LIMIT_PER_MIN` caps public reads per IP.
- Security review: [docs/SECURITY.md](../../docs/SECURITY.md). Load tests: [infra/load](../../infra/load/README.md), results in [docs/PERFORMANCE.md](../../docs/PERFORMANCE.md).

## Tests

| Command | What |
|---|---|
| `pnpm test` | Unit tests (`src/**/*.spec.ts`, Vitest) |
| `pnpm test:e2e` | Boots the real app against PostGIS, Redis, Mailpit and SeaweedFS containers started by Testcontainers (needs Docker) |
| `pnpm test:cov` | e2e with coverage; fails below 80% for `src/modules` |

## Conventions

- Routes are versioned by URI: controllers get `/v1` automatically.
- Throw `AppException(code, message, status, details?)` for expected errors. Every error is returned as `{ "error": { "code", "message", "details" } }`.
- Environment variables are validated at boot in `src/config/env.ts`. Add new ones there **and** in `.env.example`.
- The Prisma client is generated into `src/generated/prisma` (git-ignored). Raw SQL that Prisma can't express (PostGIS columns, exclusion constraints) goes in migration files.
- Logs are structured (pino) with an `x-request-id` per request. Secrets, OTPs and phone numbers are redacted (`src/common/logging/logger.config.ts`).
