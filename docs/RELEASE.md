# Releasing Sajha

The mobile part is written in Phase 9b; production infrastructure and promotion are added in 9d.

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
