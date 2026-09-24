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
