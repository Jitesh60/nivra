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

## Apps (planned monorepo)

| Path | App | Stack |
|---|---|---|
| `apps/api` | Backend API | Node.js · NestJS · PostgreSQL/PostGIS · Prisma · Redis |
| `apps/mobile` | Mobile app | Flutter · Riverpod · go_router |
| `apps/admin` | Admin panel | Next.js · shadcn/ui · Tailwind |
| `apps/web` | Marketing website | Next.js · React Bits · shaders.com · uiverse.io |

## Workflow

Work happens phase by phase, and each phase has its own branch (for example, `phase/1a-auth-backend`). At the end of a phase, the work is committed, pushed and merged into `main` through a pull request. **Nothing is pushed to `main` directly.**
