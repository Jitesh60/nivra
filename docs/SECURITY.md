# Security review: OWASP ASVS 4.0 Level 1

Reviewed in Phase 9a against the ASVS L1 requirements that apply to Sajha: a JSON API used by a mobile app, an admin panel on server-rendered pages, and a static website. For each area, the table says how it's met and where. **Gap** rows are open items with an owner phase; **Accepted** rows are risks we've decided to live with, with the reason.

## V1 Architecture, V14 Configuration

| Requirement | Status | How |
|---|---|---|
| Secrets never in code or the repo | Met | Env only, validated at boot (`apps/api/src/config/env.ts`). Staging and production refuse development settings: OTP bypass, console SMS/push, SMTP email, fake payments, unencrypted documents, Swagger in production, missing or `*` CORS. |
| Separate secrets per purpose | Met | User and admin JWT secrets must differ; `OTP_PEPPER`, `TOTP_ENC_KEY`, `ADDRESS_ENC_KEY` are separate 32-byte keys. |
| Dependencies free of known vulnerabilities | Met | `pnpm audit --prod --audit-level high` runs in CI. Two transitive advisories (mysql2, deepmerge-ts via the Prisma CLI) are pinned to fixed versions in `pnpm-workspace.yaml`. |
| Security headers | Met | Helmet on the API; admin cookies `httpOnly`, `SameSite=Strict`, `Secure` in production. Admin and web send HSTS, `nosniff`, frame, referrer and permissions headers from `next.config.ts` (9d; the admin panel also sends `X-Robots-Tag: noindex`), checked by Playwright. |
| Debug features off in production | Met | Swagger refused in production; the dev checkout route returns 404 unless the fake provider runs outside staging/production. |

## V2 Authentication

| Requirement | Status | How |
|---|---|---|
| Passwords (admins) hashed with a slow KDF | Met | argon2id (`admin-auth/password.ts`), minimum length enforced, forced change after an invite. |
| Multi-factor for privileged users | Met | TOTP is required for every admin; recovery codes are single-use and hashed. |
| Brute force protection | Met | Admin login: 5 failures lock for 15 minutes. OTP: 5 requests per number and 20 per IP an hour, a resend cooldown, and a lockout after 10 wrong codes in an hour. |
| OTP codes stored safely and short-lived | Met | HMAC with `OTP_PEPPER`; 5-minute expiry; single use; a new code replaces the old one. |
| Handover/return codes can't be guessed | Met | 6 digits derived by HMAC per booking and stage; 5 wrong tries lock for 15 minutes. |

## V3 Session management

| Requirement | Status | How |
|---|---|---|
| Short-lived access tokens, rotating refresh tokens | Met | 15-minute user and 10-minute admin access tokens; refresh tokens are stored as SHA-256 hashes and rotated on use; reuse revokes the session (`sessions.service.ts`). |
| Logout and revocation work | Met | Log out, log out everywhere, account deletion and suspension revoke sessions; admin sessions end after 12 hours regardless. |
| Tokens never exposed to browser JavaScript (admin) | Met | Admin tokens live in `httpOnly` cookies; the browser never talks to the API. |

## V4 Access control

| Requirement | Status | How |
|---|---|---|
| Deny by default | Met | Every controller declares its guard; public routes are explicit (`OptionalJwtGuard`). |
| Object-level checks (no IDOR) | Met | Bookings, chats, documents and disputes look up by id **and** participant, and answer 404 to anyone else. |
| Role checks for admins | Met | `@Roles()` on every mutating admin route (Super Admin, Ops, Support); the admin panel mirrors them but the API enforces. |
| Sensitive actions audited | Met | `audit_logs` for admin actions, document views, transcript views, refunds, dispute decisions and account deletion. |

## V5 Validation, sanitisation and encoding

| Requirement | Status | How |
|---|---|---|
| Server-side validation of all input | Met | Global `ValidationPipe` with whitelist + forbid unknown fields; DTOs on every body and query. |
| No SQL injection | Met | Prisma queries; raw SQL only through tagged templates (`Prisma.sql`), with identifiers from constants. |
| Output encoding | Met | JSON API; React escapes in admin and web; emails escape user text (`providers/email/layout.ts`). |
| File uploads checked | Met | Presigned uploads with size limits per purpose; bytes sniffed (JPEG/PNG/WebP only) and re-encoded to WebP without EXIF before use. |

## V7 Errors and logging

| Requirement | Status | How |
|---|---|---|
| No internals in error responses | Met | `AllExceptionsFilter` returns `INTERNAL_ERROR` for unknown errors. |
| No secrets or personal data in logs | Met | pino redacts auth headers, cookies, codes, passwords, refresh tokens, phone, email, PAN and account numbers; request bodies aren't logged. |
| Errors reported without personal data | Met | Sentry (when `SENTRY_DSN` is set) drops bodies, cookies, auth headers and user details except the id, and masks phone numbers, emails and codes in messages and URLs (`common/observability/scrub.ts`). |

## V8 Data protection

| Requirement | Status | How |
|---|---|---|
| Sensitive data encrypted at rest | Met | Documents in a private bucket with SSE (required outside development); exact pickup addresses AES-256-GCM; TOTP secrets encrypted. |
| Backups protected and restorable | Met (9d) | Railway volume backups plus a nightly `pg_dump` to S3 with SSE-KMS (`backup.yml`); `scripts/restore-drill.sh` restores into a throwaway database, checks migrations and the ledger, and runs in CI on every PR ([OPERATIONS.md](OPERATIONS.md)). |
| Personal data only as long as needed | Met | Shared document copies purged 30 days after a booking closes; account deletion anonymises the user and removes their files, profile, devices, payout details and preferences. |
| Sensitive data not cached | Met | Document and condition photos stream through the admin server with `no-store`; signed URLs last minutes. |

## V9 Communications

| Requirement | Status | How |
|---|---|---|
| TLS everywhere | Met (9d) | Railway and Vercel terminate TLS; the API trusts `X-Forwarded-For` only from private networks; admin and web send HSTS. |
| Deploys are reproducible | Met (9d) | One image per commit, run as a non-root user; production runs the exact digest tested on staging, after an approval ([DEPLOY.md](DEPLOY.md)). |

## V11 Business logic

| Requirement | Status | How |
|---|---|---|
| Rate limits on abusable flows | Met | Booking requests, new chats, messages, reports, OTP, waitlist, and (new in 9a) public reads per IP (`PUBLIC_READ_LIMIT_PER_MIN`, 429 with `Retry-After`). |
| Money moves once | Met | Payments, refunds and transfers are claimed atomically and idempotent on provider ids; webhooks are verified by HMAC and deduplicated; the double-entry ledger is checked by a database trigger. |

## V13 API

| Requirement | Status | How |
|---|---|---|
| Request size limits | Met | Express JSON limit (100 kB default); uploads never go through the API. |
| CORS locked down | Met | Allow-list only, refused empty or `*` in staging/production. |

## Open items

| Item | Status |
|---|---|
| Certificate pinning in the mobile app | Accepted for launch: OS trust store plus HTTPS only. Revisit after launch. |
| Web application firewall / bot protection on public reads | Accepted: per-IP limits for now; add Cloudflare in front if scraping shows up. |
| Penetration test by a third party | Gap: before scaling beyond Pune. |
