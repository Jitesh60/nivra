# @sajha/admin

Next.js admin panel for Sajha (App Router, Tailwind v4, shadcn/ui). Design: [docs/ARCHITECTURE.md §10](../../docs/ARCHITECTURE.md#10-admin-architecture-appsadmin).

## Run

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:3001 (needs the API on :3000)
```

Create the first admin, then sign in. First login sets up 2FA with an authenticator app:

```bash
pnpm --filter @sajha/api seed:admin -- --email you@sajha.app --name "Your Name"
```

## How it works

- Tokens are kept in `httpOnly` cookies and the browser never talks to the API. Pages read through Server Components and write through Server Functions, using the typed `@sajha/api-client`.
- `src/proxy.ts` sends signed-out visitors to `/login` and refreshes the access token before pages render.
- Navigation per role: `src/lib/roles.ts`. The API enforces the same rules.
- Document images are served by `src/app/(dashboard)/documents/[id]/image/route.ts`: it asks the API for a 5-minute signed URL (the API logs the view), fetches the bytes on the server and returns them with `Cache-Control: no-store`. The storage URL never reaches the browser.
- UI components are in `src/components/ui` (shadcn/ui, see `components.json`). Add more with `pnpm dlx shadcn@latest add <component>`.

## Tests

End-to-end with Playwright against a running API and database (seeds its own admins):

```bash
pnpm infra:up && pnpm --filter @sajha/api prisma:deploy
OTP_DEV_BYPASS_CODE=000000 pnpm --filter @sajha/api dev   # the documents suite signs up app users
pnpm --filter @sajha/admin build
pnpm --filter @sajha/admin test:e2e
# If Playwright's bundled Chromium isn't installed: PW_CHROMIUM_PATH=/path/to/chromium pnpm test:e2e
```

Covered: wrong password, signed-out redirect, first login with 2FA setup and recovery codes, httpOnly cookies, silent token refresh, inviting an admin, forced password change, role-limited menu and 403, recovery-code sign-in (single use), disabling an admin signs them out.
Listings (`e2e/listings.spec.ts`): a verified lender publishes through the API; Ops approves the first listing (flagged "first listing"; photos, price and earnings shown, exact address never), and it becomes public. The lender's next listing is live without review and Ops unpublishes it. Rejecting with a reason and moving a category reach the lender. Categories: create, a duplicate slug is refused, reorder, and hide (which removes it from the public list). Support can read listings but can't moderate or open Categories.
Documents (`e2e/documents.spec.ts`): an app user uploads IDs through presigned URLs, an Ops admin reviews them (the image streams through the admin server with `no-store`, with a watermark), approving flips the user's `idVerified`, rejecting records the reason, suspending revokes the user's sessions, and Support gets 403 on documents.
Reports (`e2e/reports.spec.ts`): two app users chat through the API; the lender's UPI ID and phone number are masked for the borrower, who reports the message and the listing. Ops finds the report, sees the original and masked text, reads the logged transcript and closes it as actioned. Support can read reports but can't close them.
Bookings (`e2e/bookings.spec.ts`): a lender's listing that asks for an ID is approved by Ops. A borrower requests it, the lender accepts, the borrower shares a PAN, the lender opens it and approves it, and the booking awaits payment. Ops finds it by search and tab, sees the timeline and the document view log, and cancels it with a reason (it moves to Closed). Support can read a request but can't cancel it.
Payments (`e2e/payments.spec.ts`): a borrower pays for a booking through the API's test checkout (the fake provider). Ops follows the booking to its payment and sees the lender's share waiting for a bank account and the four ledger lines. The ledger is balanced, and the payout is listed. Ops refunds ₹150 as goodwill after an amount that's too large is refused, and the ledger stays balanced. Support can read payments but can't refund them.

## API types

When API endpoints change, regenerate the OpenAPI document (CI fails if it's stale):

```bash
pnpm --filter @sajha/api build && pnpm --filter @sajha/api openapi:export
```
