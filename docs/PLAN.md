# Sajha — Engineering Plan

This doc explains **how** we'll build what the [PRD](./PRD.md) describes: stack choices, repo layout, conventions, the Git workflow, testing, risks and open decisions. The system design lives in [ARCHITECTURE](./ARCHITECTURE.md), and the delivery order lives in [PHASES](./PHASES.md).

---

## 1. Stack

### 1.1 Backend — `apps/api`
| Concern | Choice | Why |
|---|---|---|
| Runtime / language | Node.js 22 LTS, TypeScript (strict) | Team requirement; type safety shared with admin and web |
| Framework | **NestJS** | Modules, DI, guards, pipes, Swagger and WebSocket gateways built in; the structure scales phase by phase |
| Database | **PostgreSQL 16 + PostGIS** | Relational data (bookings, payments, ledger); transactions; exclusion constraints to stop double-booking; geo queries for "near me" |
| ORM | **Prisma** | Typed client and migrations. Raw SQL is used for PostGIS and exclusion constraints inside migrations. |
| Cache / queues | **Redis** + **BullMQ** | OTP rate limits, cooldowns, background jobs (expiry, reminders, purges), Socket.IO adapter |
| Realtime | **Socket.IO** (NestJS gateway) | Chat, typing indicators, booking status updates |
| Storage | S3-compatible: **AWS S3 (ap-south-1)** in production, **SeaweedFS** (S3-compatible) locally | Listing photos (public bucket via CDN) and documents (private, encrypted bucket) |
| Validation | `class-validator` + `class-transformer` DTOs | Native to NestJS and generates Swagger schemas |
| Auth | `@nestjs/jwt`, `argon2`, `otplib` (TOTP) | See ARCHITECTURE §4 |
| Docs | `@nestjs/swagger` → OpenAPI 3 at `/docs` | Single API contract; generates the TypeScript client |
| Logging / errors | `nestjs-pino`, Sentry | Structured logs with request IDs |
| Tests | Vitest, Supertest, Testcontainers (Postgres + Redis) | Real database in e2e tests |

### 1.2 Mobile — `apps/mobile`
| Concern | Choice |
|---|---|
| Framework | **Flutter** (stable channel), Dart 3 |
| State management | **Riverpod** (with `riverpod_generator`) |
| Navigation | **go_router** (with auth redirect guards) |
| HTTP | **dio**, with interceptors for auth, token refresh and logging |
| Models | **freezed** + **json_serializable** |
| Secure storage | **flutter_secure_storage** (refresh token) |
| Realtime | **socket_io_client** |
| Push | **firebase_messaging** + **flutter_local_notifications** |
| OTP auto-fill | **sms_autofill** (Android SMS Retriever), iOS `oneTimeCode` autofill hint |
| Media | **image_picker**, **image_cropper**, **cached_network_image** |
| Maps | **google_maps_flutter** + **geolocator** |
| Payments | **razorpay_flutter** |
| UI effects | Custom GLSL `FragmentProgram` shaders, **flutter_animate**, **rive**, **lottie**, **shimmer** |
| i18n | `flutter_localizations` + ARB files (English first, Hindi later) |
| Tests | `flutter_test` widget tests, `integration_test`, `mocktail` |

### 1.3 Admin — `apps/admin`
Next.js (App Router) · TypeScript · Tailwind CSS · **shadcn/ui** · TanStack Query and TanStack Table · React Hook Form + Zod · a typed API client generated from OpenAPI · Playwright smoke tests.

### 1.4 Marketing website — `apps/web`
Next.js (App Router, static generation) · Tailwind CSS · **React Bits** · **shaders.com** components · **uiverse.io** components · Motion (Framer Motion) · next-seo/metadata · Playwright smoke tests. Deployed on Vercel or a similar host.

### 1.5 Third-party services (India)
| Need | Provider | Fallback / notes |
|---|---|---|
| SMS OTP | **MSG91** (DLT-registered template) | Twilio Verify |
| Email OTP / transactional | **Resend** | AWS SES |
| Payments, refunds, lender payouts | **Razorpay** Payments + **Razorpay Route** (linked accounts, on-hold transfers) | — |
| Push | **Firebase Cloud Messaging** | — |
| Maps / geocoding | Google Maps Platform | — |
| Error monitoring | Sentry | — |

> All providers sit behind interfaces (`SmsProvider`, `EmailProvider`, `PaymentProvider`, `StorageProvider`). Local development and tests use **console/Mailpit/SeaweedFS fakes**, so no real SMS, email or payment calls are needed to develop.

## 2. About the UI effect libraries (important)

[uiverse.io](https://uiverse.io/), [shaders.com](https://shaders.com/) and [reactbits.dev](https://reactbits.dev/) are **web** libraries: HTML/CSS, React components and WebGL shaders.

| Target | How we use them |
|---|---|
| **Marketing website (Next.js)** | Use them directly. Copy React Bits components (via their CLI or shadcn registry) and shaders.com components, and port uiverse snippets into Tailwind/React components. |
| **Admin (Next.js)** | Use them sparingly (for example, the login-screen background and buttons). Admin should stay fast and plain. |
| **Mobile (Flutter)** | They **cannot be imported into Flutter**, because Flutter doesn't render HTML/CSS/React. We recreate the **same visual language natively**: |
| | • Shader backgrounds → GLSL fragment shaders loaded with Flutter's `FragmentProgram` (for example, gradient mesh or aurora on splash/onboarding/auth) |
| | • React Bits text and motion effects → `flutter_animate` (fade, slide, shimmer, blur-in, split text) |
| | • uiverse buttons, loaders, cards and toggles → custom Flutter widgets styled from the same designs |
| | • Illustrations and micro-interactions → Rive / Lottie |

This keeps the app fast, accessible and store-compliant while matching the look of the website. A shared **design-tokens** file (colours, radii, typography, spacing) is defined once in `packages/design-tokens` and exported to Tailwind (web/admin) and a Dart theme (mobile).

## 3. Repository layout (monorepo)

```
sajha/
├── apps/
│   ├── api/          # NestJS backend
│   ├── mobile/       # Flutter app
│   ├── admin/        # Next.js admin panel
│   └── web/          # Next.js marketing site
├── packages/
│   ├── api-client/   # TS client generated from OpenAPI (used by admin + web)
│   ├── design-tokens/# colours/typography → Tailwind preset + Dart theme
│   ├── eslint-config/
│   └── tsconfig/
├── infra/
│   └── docker-compose.yml   # postgis, redis, seaweedfs (s3), mailpit
├── docs/             # PRD, PLAN, ARCHITECTURE, PHASES
├── .github/workflows/ # CI
├── package.json      # pnpm workspaces
├── pnpm-workspace.yaml
└── turbo.json        # Turborepo pipelines (lint, test, build)
```

- **pnpm workspaces + Turborepo** manage the JS/TS apps and packages.
- Flutter lives in `apps/mobile` with its own `pubspec.yaml` and is driven by its own CI job.

## 4. Conventions

- **API:** REST under `/v1`, JSON, camelCase fields, ISO-8601 UTC timestamps, amounts in **paise (integer)**. Standard error shape: `{ "error": { "code": "OTP_INVALID", "message": "...", "details": {} } }`. Cursor pagination: `?cursor=&limit=`.
- **IDs:** UUID v7 (sortable).
- **Contract-first:** Swagger is the source of truth. `pnpm gen:api` regenerates `packages/api-client`, and the Flutter models are kept in sync by hand (or with `openapi-generator` later).
- **Config:** every app ships a `.env.example`; secrets are never committed. Config is validated at boot (Zod/Joi); the app fails fast if something is missing.
- **Code style:** ESLint + Prettier (TS), `flutter_lints` + `dart format` (Dart). Pre-commit hooks run through Husky + lint-staged.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(auth-api): …`, `fix(mobile): …`, `docs: …`.

## 5. Git workflow

> **Rule: never push to `main` directly.** `main` only changes by merging a reviewed pull request.

1. **One branch per phase or sub-phase**, created from the latest `main`:
   - `phase/0-foundation`
   - `phase/1a-auth-backend`, `phase/1b-auth-mobile`, `phase/1c-auth-admin`, `phase/1d-marketing-web`
   - `phase/2-profiles-verification`, … (see [PHASES](./PHASES.md) for every branch name)
2. Work-in-progress commits inside a phase are fine.
3. **At the end of every phase, commit and push**: when the phase's acceptance criteria pass, make the final commit, run `git push -u origin <branch>`, and open a **PR into `main`**.
4. The PR description lists what was built, how to run it, and a checked acceptance-criteria list.
5. CI (lint, typecheck, tests, build) must be green before merging.
6. The **next phase branches from `main` only after the previous PR is merged**, so each phase builds on reviewed code.
7. Hotfixes use `fix/<short-name>` branches and also go through a PR.

Branch protection on `main` (recommended to enable in GitHub settings): require a PR, require CI to pass, and block force pushes.

## 6. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| API unit | Vitest | Services, guards, OTP logic, state machine, fee calculation |
| API e2e | Vitest + Supertest + Testcontainers | Real Postgres + Redis; every endpoint's happy path and main failure cases |
| Mobile | `flutter_test`, `mocktail` | Widgets (auth screens), Riverpod notifiers, repositories |
| Mobile integration | `integration_test` | Auth flow against a local API |
| Admin / web | Playwright | Login + 2FA; landing page renders; waitlist submit |
| CI | GitHub Actions | `lint → typecheck → test → build` for changed apps (Turborepo cache), plus `flutter analyze && flutter test` |

## 7. Environments

| Env | Purpose | Infra |
|---|---|---|
| **local** | Development | `docker compose up` (PostGIS, Redis, SeaweedFS, Mailpit); fake SMS logs the OTP to the console; Razorpay test mode |
| **staging** | QA and demos | Managed Postgres + Redis, S3 bucket, Razorpay test mode, real SMS/email to allow-listed numbers |
| **production** | Live | Managed Postgres (with PITR backups), Redis, S3 + CloudFront, Razorpay live |

Hosting is an open decision (AWS ECS/Fargate, Render or Railway for the API; Vercel for admin and web).

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Item damaged, lost or not returned | Security deposit, condition photos at handover and return, requested documents, dispute flow, blocking bad users |
| Document privacy leak | Private encrypted bucket, 5-min signed view URLs, booking-scoped access, view audit log, automatic purge, masked Aadhaar |
| Fake accounts / fraud | Phone + email OTP, OTP rate limits, device-bound sessions, report/ban, ID verification later |
| OTP/SMS cost abuse | Per-phone, per-IP and per-device rate limits; resend cooldown; CAPTCHA/Play Integrity later |
| Holding customer money (RBI rules) | Sajha doesn't hold funds itself; Razorpay Route **on-hold transfers** release money to the lender only after return |
| Double-booking | Postgres exclusion constraint on booked date ranges plus transactional checks |
| Deals taken off-platform | Contact masking in chat until confirmation; value of deposit protection and reviews |
| DLT registration delay for SMS in India | Start MSG91 DLT/template registration in Phase 0; use a fake provider until then |
| Scope creep | Strict phase boundaries; "Later" features stay parked |

## 9. Open decisions

| # | Decision | Needed by |
|---|---|---|
| 1 | Launch city | Phase 4 |
| 2 | Commission % and borrower service fee | Phase 7 |
| 3 | Deposit policy (caps, suggestions) | Phase 3 |
| 4 | Cancellation tiers (final) | Phase 6 |
| 5 | Pre- or post-moderation of listings | Phase 3 |
| 6 | Hosting provider | Before staging (Phase 1 end) |
| 7 | Brand: logo, colours, fonts | Phase 1b / 1d |
| 8 | Accounts: MSG91 (DLT), Resend, Razorpay, Firebase, Google Maps, Apple Developer, Play Console | Phase 0 (start early) |
