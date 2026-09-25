# Operating Sajha

What to watch in production and what to do when something breaks. Deployment is covered in [DEPLOY.md](DEPLOY.md), and store releases in [RELEASE.md](RELEASE.md).

## Where to look first

| Question | Where |
|---|---|
| Is the API up, which version? | `GET https://api.sajha.app/v1/health` → `status`, `checks.database`, `checks.redis`, `version` |
| Are jobs keeping up? | Admin → Overview → **API status**: waiting / running / scheduled / failed jobs and workers listening, per queue (`GET /v1/admin/system`) |
| Errors | Sentry: projects `sajha-api`, `sajha-admin`, `sajha-web`, `sajha-app` |
| Logs | Railway → service → Logs (JSON; personal data redacted). Filter by `req.id` from an error |
| Business health | Admin → Overview: bookings paid, GMV and disputes against the previous period |

**Reading the queue table.**
- `waiting` should drain within a minute or two.
- `scheduled` is normal: booking timers and retries.
- `failed` counts the last 1,000 failures. A rising number means a job is broken, and Sentry has the error, tagged with the queue.
- `workers` is how many workers listen on each queue; a dash means Redis doesn't allow `CLIENT LIST`. **0 means the worker service is down.**

## Alerts to set up

| Tool | Rule | Send to |
|---|---|---|
| Sentry (each project) | A new issue; an issue seen more than 20 times in 1 hour; a regression | Email + Slack `#sajha-alerts` |
| Sentry (API) | Any event tagged `queue:*` (failed jobs) more than 5 times in 15 minutes | same |
| Sentry (app) | Crash-free sessions below 99.5% | same |
| Uptime monitor (Better Stack or UptimeRobot) | `https://api.sajha.app/v1/health` must return 200 with `"status":"ok"`, every minute from India; `https://admin.sajha.app/login` and `https://sajha.app` must return 200 | Phone call + Slack |
| Railway (api and worker) | CPU above 80% for 10 minutes; memory above 80%; more than 3 restarts in 15 minutes; deploy failed | Email + Slack |
| Railway (Postgres) | Disk above 75%; connections above 80% of the maximum | Email + Slack |
| GitHub | `Backup` workflow failed (notifications for failed runs on) | Email |

## Incidents

### Payments: webhooks failing or payments stuck at "processing"

- **Symptoms:**
  - borrowers paid but their bookings stay awaiting payment
  - Sentry shows errors on `/v1/payments/webhook`
  - Razorpay → Webhooks shows failed deliveries
- **What to do:**
  1. Check `RAZORPAY_WEBHOOK_SECRET` matches the secret in the Razorpay dashboard. A mismatch returns 400 on every delivery.
  2. A payment is captured either by the webhook or by the app's verify call right after checkout. A borrower who closed the app before the verify call depends on the webhook. The 5-minute payments sweep only retries refunds, settlements and payouts; it doesn't capture payments.
  3. Once it's fixed, use Razorpay's *Resend* on the failed webhook deliveries. Each event is applied only once, so resending is safe. Check that the `payments` queue has a worker and no failed jobs.
  4. Check Admin → Payments → Ledger shows **Balanced** and that no captured payment lacks a ledger entry.

### SMS provider down (sign-in codes not arriving)

- **Symptoms:** sign-in complaints, and Sentry errors from the MSG91 provider.
- **What to do:**
  1. Check the MSG91 status page and account balance, and that the DLT templates are still approved.
  2. People with a verified email can still get codes by email.
  3. Post a banner on the website and social media if it lasts more than 15 minutes.
  4. If the outage is long, a second SMS provider would need code; there's no fallback today.

### Storage errors (photos or documents not loading or uploading)

- **Symptoms:** image upload or view failures, and S3 errors in Sentry.
- **What to do:**
  1. Check the AWS Health Dashboard for ap-south-1.
  2. Check that the IAM key hasn't expired or been rotated without updating Railway.
  3. Check the bucket policy, and the KMS key policy for the private bucket.
  4. Document views are logged, so there's nothing to reconcile afterwards. People retry their own uploads.

### Jobs piling up (queue `waiting` grows, or `workers` is 0)

1. Railway → `worker`: is it running? Check the restarts and logs.
2. Redis: memory and connections. BullMQ needs `maxmemory-policy noeviction`.
3. Restart the worker. Jobs are safe to repeat, and the sweeps catch anything missed.

### Database

- **Slow queries:** Railway metrics, plus `pg_stat_statements` if enabled. [PERFORMANCE.md](PERFORMANCE.md) has the load-test baseline.
- **Disk full:** increase the volume. Don't delete data by hand.
- **Restore needed:** see below.

## Backups and restore

- **Railway volume backups** (production Postgres): daily, kept by Railway. This is the quickest way back after a bad migration or a lost volume.
- **Nightly logical backup:**
  - `.github/workflows/backup.yml` runs at 01:47 IST: `pg_dump` in custom format, a check that the dump can be listed, then upload to `s3://$BACKUP_BUCKET/postgres/production/` with SSE-KMS.
  - The S3 lifecycle rule moves dumps to Glacier after 30 days and deletes them after 180.
  - Skipped with a notice until its secrets are set (DEPLOY.md).
- **RPO:** up to 24 hours from the nightly dump. Railway backups may be more recent.

**Restore drill.** `scripts/restore-drill.sh` restores a dump into a throwaway PostGIS container. It then checks that `prisma migrate status` is up to date, prints row counts, and fails if the ledger doesn't balance. It prints the time taken.

```bash
scripts/restore-drill.sh s3://sajha-backups/postgres/production/sajha-20261001T201700Z.dump
scripts/restore-drill.sh --from-url "$DATABASE_URL"   # dump a database and restore that
```

CI runs the drill on every PR, against a freshly migrated database. Run it by hand against the latest production backup **every quarter**, and after any change to the backup workflow, and record the result here.

| Date | Source | Size | Result | Restore | Total (RTO for the data) |
|---|---|---|---|---|---|
| 2026-09-25 | Local development database (185 users, 95 listings, 53 bookings, 180 ledger entries) | 508 KB | Passed; 11/11 migrations; ledger balanced | < 1 s | 9 s |
| 2026-09-25 | Load-test seed (50 lenders, 2,000 live listings) | 292 KB | Passed | 1 s | 8 s |

**Restoring production for real:**
1. Put up the maintenance notice.
2. Scale `api` and `worker` to 0.
3. Restore into a new Railway Postgres (from a Railway backup, or `pg_restore --no-owner --no-privileges` of the latest dump).
4. Run the drill's checks against it.
5. Point `DATABASE_URL` at it and scale back up.

The full RTO is about 30 minutes plus the restore time. Payments made after the dump have to be reconciled by hand against the Razorpay dashboard. Their orders aren't in the restored database, so refund them or book them again with the people involved.

## Secrets rotation

| Secret | How to rotate |
|---|---|
| JWT secrets | Change them in Railway. Everyone signs in again when their access token expires, which takes 15 minutes. |
| `OTP_PEPPER` | Change it any time; only codes already sent become invalid. |
| `TOTP_ENC_KEY`, `ADDRESS_ENC_KEY` | Don't change them without a re-encryption script: data encrypted with the old key becomes unreadable. |
| Provider keys (Razorpay, MSG91, Resend, FCM, AWS) | Create the new key, update both Railway services, deploy, then revoke the old key. |
