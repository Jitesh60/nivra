# Releasing Sajha

The mobile part was written in Phase 9b, and production infrastructure in 9d. Deploying the servers is in [DEPLOY.md](DEPLOY.md), and running them in [OPERATIONS.md](OPERATIONS.md).

## Mobile app

### One-time setup

| What | Where | Notes |
|---|---|---|
| Google Play Console account | play.google.com/console | Organisation account (D-U-N-S number) so the listing shows the company name |
| Apple Developer Program | developer.apple.com | Organisation; needed for TestFlight and the App Store |
| Firebase project | console.firebase.google.com | Android app `com.sajha.app` (+ `.staging`); iOS app; copy the four values into `config/prod.json` (see the mobile README) |
| Sentry project (Flutter) | sentry.io | Put the DSN in `config/prod.json` as `SENTRY_DSN` |
| Upload key (Android) | your machine | See below; back it up in the team password manager |

**Android upload key.** Play App Signing keeps the real signing key; you sign uploads with an upload key:

```bash
keytool -genkey -v -keystore ~/sajha-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
cat > apps/mobile/android/key.properties <<'PROPS'
storeFile=/home/you/sajha-upload.jks
storePassword=…
keyAlias=upload
keyPassword=…
PROPS
```

`key.properties` and `*.jks` are git-ignored. Without them, `flutter build appbundle --flavor prod` stops with "Prod release builds need android/key.properties" (CI checks that it does).

### Each release

1. Bump `version:` in `apps/mobile/pubspec.yaml` (`1.2.0+12`: the name, then a build number that always goes up).
2. Fill `config/prod.json` (API URL, Firebase, Sentry DSN). Never commit real keys to a public repo; this repo is private.
3. Build:
   ```bash
   cd apps/mobile
   flutter build appbundle --release --flavor prod --dart-define-from-file=config/prod.json --obfuscate --split-debug-info=build/symbols
   # iOS, on a Mac with Xcode (scheme setup: see the mobile README)
   flutter build ipa --release --dart-define-from-file=config/prod.json --obfuscate --split-debug-info=build/symbols
   ```
   Keep `build/symbols` for the release (upload them to Sentry with `sentry-cli debug-files upload build/symbols` so crash stacks are readable).
4. **Play Console:** upload the `.aab` to *Internal testing*, test on a real phone (sign-in, search, book with a test payment, handover codes), then promote to *Production* with a **staged rollout** (10% → 50% → 100% over a few days, watching Sentry and the reviews).
5. **App Store Connect:** upload with Xcode or Transporter → TestFlight → submit for review.

### Store forms (first release, and when data use changes)

Everything to paste is in [apps/mobile/store](../apps/mobile/store/README.md):

- Main store listing: `listing.md`, the 512 px icon `assets/brand/store-icon-512.png`, screenshots in `store/screenshots/`, and a 1024×500 feature graphic.
- Data safety: `data-safety.md`. Privacy policy URL: https://sajha.app/privacy.
- **Account deletion URL** (required by Play): https://sajha.app/delete-account (added to the website in 9c).
- Content rating: `content-rating.md`. Target audience: 18+.
- App Store privacy labels: `app-privacy.md`.

### After release

- Watch Sentry (new issues, crash-free sessions) and Play's Android vitals for a week.
- Answer reviews within two days.

## Launch checklist

Work through it top to bottom. Each line is done when someone has checked it on production, not just on staging.

**Accounts**
- [ ] Railway (Pro): project `sajha` with `staging` and `production`, PostGIS and Redis, and volume backups on (DEPLOY.md §1)
- [ ] Vercel: `sajha-admin` and `sajha-web`, with domains `admin.sajha.app` and `sajha.app` and preview protection on admin
- [ ] AWS: media, private-documents (SSE-KMS) and backup buckets in ap-south-1; separate IAM users for the API and for backups
- [ ] Razorpay: live KYC done, Route enabled, live keys, and the webhook pointing at `https://api.sajha.app/v1/payments/webhook`
- [ ] MSG91: DLT entity and the OTP and overdue templates approved
- [ ] Resend: `sajha.app` verified (SPF, DKIM, DMARC)
- [ ] Firebase: production project with Android and iOS apps, and the APNs key uploaded
- [ ] Sentry: projects `sajha-api`, `sajha-admin`, `sajha-web`, `sajha-app`, with the alert rules from OPERATIONS.md
- [ ] Uptime monitor on the API health check, admin and web

**Production settings**
- [ ] Every API variable in DEPLOY.md is set on both services. The API refuses to start with development settings, so a clean boot is the check.
- [ ] GitHub environments `staging` and `production` have the Railway, `API_URL` and backup secrets, and `production` has required reviewers
- [ ] First admin created: `railway run --service api -- node dist/cli/seed-admin.js --email … --name …`, then 2FA set up
- [ ] Categories reviewed in Admin → Categories

**Go / no-go on production**
- [ ] `deploy.yml` promoted a commit, and `/v1/health` shows its `version`
- [ ] A real ₹1 booking end to end: pay, handover code, return, deposit back; Admin → Payments → Ledger shows **Balanced**
- [ ] Sign-in by SMS and by email arrives within 30 seconds
- [ ] A push notification arrives on Android and iOS
- [ ] `Backup` workflow ran, and `scripts/restore-drill.sh s3://…` passed on its dump; result recorded in OPERATIONS.md
- [ ] Terms, Privacy and Delete-account pages reviewed by a lawyer, with the draft notices removed
- [ ] Store URLs set on `sajha-web` and redeployed: the waitlist becomes download buttons
- [ ] Waitlist exported (Admin → Waitlist) and the launch email sent

**First week**
- [ ] Sentry, uptime and Railway alerts are quiet, or each alert has an owner
- [ ] Staged rollout on Play: 10% → 50% → 100%
- [ ] Admin dashboard reviewed daily: bookings paid, disputes, and failed jobs in the queue table
