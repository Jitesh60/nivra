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

## Tests

| Command | What |
|---|---|
| `pnpm test` | Unit tests (`src/**/*.spec.ts`, Vitest) |
| `pnpm test:e2e` | Boots the real app against PostGIS, Redis and Mailpit containers started by Testcontainers (needs Docker) |
| `pnpm test:cov` | e2e with coverage; fails below 80% for `src/modules` |

## Conventions

- Routes are versioned by URI: controllers get `/v1` automatically.
- Throw `AppException(code, message, status, details?)` for expected errors. Every error is returned as `{ "error": { "code", "message", "details" } }`.
- Environment variables are validated at boot in `src/config/env.ts`. Add new ones there **and** in `.env.example`.
- The Prisma client is generated into `src/generated/prisma` (git-ignored). Raw SQL that Prisma can't express (PostGIS columns, exclusion constraints) goes in migration files.
- Logs are structured (pino) with an `x-request-id` per request. Secrets, OTPs and phone numbers are redacted (`src/common/logging/logger.config.ts`).
