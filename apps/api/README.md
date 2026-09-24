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
