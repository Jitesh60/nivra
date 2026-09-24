# Sajha (साझा)

**Borrow what you need. Lend what you don't use.**

Sajha is a peer-to-peer rental marketplace for India. People list things they rarely use, such as trekking shoes, tents, cameras or tools, and others rent them for a few days at a small price instead of buying. It includes verified users (phone and email OTP), in-app chat to negotiate price and dates, lender-requested documents, security deposits, and safe payments.

## Documentation

| Doc | What's inside |
|---|---|
| [PRD](docs/PRD.md) | Problem, personas, user journeys, features, business rules, admin and marketing scope |
| [Plan](docs/PLAN.md) | Tech stack, monorepo layout, conventions, **Git workflow**, testing, risks, open decisions |
| [Architecture](docs/ARCHITECTURE.md) | System design, API modules, data model, auth, booking state machine, payments, chat, document vault |
| [Phases](docs/PHASES.md) | Phase-by-phase roadmap with branches and acceptance criteria |

## Apps

| Path | App | Stack |
|---|---|---|
| `apps/api` | Backend API | Node.js · NestJS · PostgreSQL/PostGIS · Prisma · Redis |
| `apps/mobile` | Mobile app | Flutter · Riverpod · go_router |
| `apps/admin` | Admin panel | Next.js · shadcn/ui · Tailwind |
| `apps/web` | Marketing website | Next.js · React Bits · shaders.com · uiverse.io |

## Getting started

**Prerequisites:** Node.js 22 (`.nvmrc`), pnpm 10 (`corepack enable`), Docker, and Flutter 3.47+ for the mobile app.

```bash
pnpm install                       # JS/TS apps and packages
pnpm infra:up                      # Postgres+PostGIS, Redis, S3 (SeaweedFS), Mailpit
cp apps/api/.env.example apps/api/.env
pnpm --filter @sajha/api prisma:deploy   # apply database migrations
pnpm dev                           # API :3000 · admin :3001 · web :3002
```

| URL | What |
|---|---|
| http://localhost:3000/v1/health | API health (database + Redis) |
| http://localhost:3000/docs | Swagger / OpenAPI |
| http://localhost:3001 | Admin panel |
| http://localhost:3002 | Marketing website |
| http://localhost:8025 | Mailpit (catches all local email) |
| http://localhost:9000 | Local S3 API (key `sajha`, secret `sajha-s3-secret`) |

Mobile: see [apps/mobile/README.md](apps/mobile/README.md).

### Everyday commands

| Command | Does |
|---|---|
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | Run across every JS/TS workspace (Turborepo) |
| `pnpm --filter @sajha/api test:e2e` | API end-to-end tests against throwaway Postgres + Redis containers |
| `pnpm format` | Prettier |
| `pnpm tokens` | Rebuild design tokens (Tailwind theme + Dart theme) after editing `packages/design-tokens/src/tokens.json` |
| `pnpm infra:down` | Stop local infrastructure |

## Repository layout

```
apps/api            NestJS backend
apps/mobile         Flutter app
apps/admin          Next.js admin panel
apps/web            Next.js marketing site
packages/design-tokens  Colours, fonts, radii → Tailwind theme + Dart theme
packages/eslint-config  Shared ESLint config
packages/tsconfig       Shared TypeScript configs
infra/              docker-compose for local services
docs/               PRD, plan, architecture, phases
```

## Workflow

Work happens phase by phase, and each phase has its own branch (for example, `phase/1a-auth-backend`). At the end of a phase, the work is committed, pushed and merged into `main` through a pull request. **Nothing is pushed to `main` directly.**
