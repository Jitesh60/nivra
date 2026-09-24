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

## Tests

| Command | What |
|---|---|
| `pnpm test` | Unit tests (`src/**/*.spec.ts`, Vitest) |
| `pnpm test:e2e` | Boots the real app against PostGIS + Redis containers started by Testcontainers (needs Docker) |

## Conventions

- Routes are versioned by URI: controllers get `/v1` automatically.
- Throw `AppException(code, message, status, details?)` for expected errors. Every error is returned as `{ "error": { "code", "message", "details" } }`.
- Environment variables are validated at boot in `src/config/env.ts`. Add new ones there **and** in `.env.example`.
- The Prisma client is generated into `src/generated/prisma` (git-ignored). Raw SQL that Prisma can't express (PostGIS columns, exclusion constraints) goes in migration files.
- Logs are structured (pino) with an `x-request-id` per request. Secrets, OTPs and phone numbers are redacted (`src/common/logging/logger.config.ts`).
