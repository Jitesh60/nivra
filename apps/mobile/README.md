# Sajha mobile (Flutter)

## Run

```bash
flutter pub get
# Android (flavors: dev | staging | prod)
flutter run --flavor dev --dart-define-from-file=config/dev.json
# iOS (flavor schemes are added later; env still comes from the config file)
flutter run --dart-define-from-file=config/dev.json
```

`config/dev.json` points at `http://10.0.2.2:3000`, which is the host machine's API as seen from the Android emulator. On a physical device, use your machine's LAN IP.

| Android flavor | App ID | Name |
|---|---|---|
| dev | `com.sajha.app.dev` | Sajha Dev |
| staging | `com.sajha.app.staging` | Sajha Staging |
| prod | `com.sajha.app` | Sajha |

## Checks

```bash
dart format lib test
flutter analyze
flutter test          # unit + widget tests against an in-memory fake API
```

**Live contract test** (the app's real repositories over real HTTP against the API, including a real photo and document upload and a published listing, against local storage; skipped by default):

```bash
# in apps/api: start the API with a fixed OTP code
OTP_DEV_BYPASS_CODE=000000 pnpm dev
# in apps/mobile
flutter test test/live_api_test.dart --dart-define=LIVE_API_URL=http://localhost:3000
```

## Signing in locally

With the API running (`pnpm dev` at the repo root) and `SMS_PROVIDER=console`, the SMS code is printed in the API log. Emails land in Mailpit at http://localhost:8025. Alternatively, set `OTP_DEV_BYPASS_CODE=000000` in `apps/api/.env` to use `000000` for every code.

**Photos and documents locally:** upload URLs and profile photo URLs point at the local S3 storage on `localhost:9000`. On an Android emulator or a USB device, forward the ports so `localhost` reaches your machine:

```bash
adb reverse tcp:9000 tcp:9000   # storage (uploads, photos)
adb reverse tcp:3000 tcp:3000   # API: then API_BASE_URL can be http://localhost:3000
```

The `dev` Android flavor may use plain HTTP to `10.0.2.2` / `localhost` (`android/app/src/dev/res/xml/network_security_config.xml`). `staging` and `prod` are HTTPS-only.

## Listings & the map

- Lenders need a verified phone and email. Home → **List an item** opens a 7-step wizard: photos → details → price → availability → pickup → documents → preview. It saves the draft, uploads the photos, then publishes: the first listing goes to review, and later ones go live. **My listings** shows the status and lets the lender edit, pause or resume, and delete.
- The pickup map uses `flutter_map` with **OpenStreetMap tiles** by default. OSM's public tiles are for light use only, so before launch point `MAP_TILE_URL` at a paid or self-hosted tile server (in `config/<env>.json`, e.g. `"MAP_TILE_URL": "https://tiles.example.com/{z}/{x}/{y}.png"`). The attribution must stay visible.
- The location permission is "while in use" only (`ACCESS_FINE_LOCATION` / `NSLocationWhenInUseUsageDescription`). If it's refused, the lender moves the map by hand. The pin only moves on the lender's own drags or "Use my location".
- Marketplace rules (commission, price and deposit limits) come from `GET /v1/config`; nothing is hard-coded.

## Browsing & search

- **Signing in:** people can browse without an account, including home, search, the map area picker and item pages. The first run still shows onboarding and the sign-in screen, with **Browse first** to skip it. Saving an item asks for sign-in, then comes back to the item and saves it.
- **Search area:** set from home or search, using GPS or the map, with a 1–25 km radius. It's saved on the device, along with the last 20 items viewed.
- **Filters and dates:** search has keywords, dates, a filters sheet and sort. Item pages show the price for chosen dates. Chat and booking buttons are placeholders until Phases 5–6.
- **Live contract test:** it browses as a guest and saves a wishlist item. It needs at least one LIVE listing on the server (approve one in the admin panel), and skips those parts otherwise.

## Chat & push

- **Chat:** "Chat" on an item opens the conversation (guests sign in first). The inbox is the chat icon on home, with an unread badge.
  - Messages arrive live over Socket.IO (`<API_BASE_URL>/ws`) while the app is open.
  - Phone numbers and emails from the other person show as `•••` until a booking is confirmed.
  - Offers (dates and a price per day) can be accepted, countered or declined. An accepted offer becomes a booking; the chat shows **Open booking**.
  - Report and block are in the chat's menu; long-press a message to report it.
- **Push is off until Firebase is set up.** To turn it on:
  1. Create a Firebase project and add the Android app, with each flavor's application ID (`com.sajha.app[.dev|.staging]`).
  2. Fill `FIREBASE_API_KEY`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID` and `FIREBASE_PROJECT_ID` in `config/<env>.json`. No google-services files are needed; the app initialises Firebase from these.
  3. Give the API the matching service account (`PUSH_PROVIDER=fcm`, see `apps/api/README.md`).

  iOS also needs the Push Notifications capability, the remote-notification background mode, an APNs key in Firebase, and an iOS app id (set up on a Mac).
- **Live contract test:** it chats over the real socket as a borrower. It opens a chat on a live listing, sends a message and gets it back live, makes an offer, and registers a push token. It then requests to book the same item (and gets `booking:updated` live), lists and cancels the booking, and reads the notifications.

## Bookings (Phase 6b)

- **Request to book:** pick dates on an item, then "Request to book". A sheet shows the price, the refundable deposit and the documents the lender asks for.
  - Guests sign in first and come back to the same request (`/item/:id?book=1&from=…&to=…`).
  - People without a verified email are asked to verify it.
- **My bookings** is the calendar icon on home, and in Profile. It has Borrowing and Lending tabs, each with In progress and Past.
- **The booking page** shows the status, what happens next with a countdown, the price, documents, the timeline and a link to the chat. Buttons (accept, decline, share documents, approve, don't accept, cancel) come from the API's `can` flags.
- **Documents:** the borrower picks a matching document from their vault for each one asked for, agrees to share it for this booking only, and later sees each time the lender opened it.
- **The lender's viewer** loads a 5-minute link and draws a watermark with their name and the booking.
  - **Android:** it sets `FLAG_SECURE` (screenshots and recordings show black) through the `sajha/secure` channel in `MainActivity.kt`.
  - **iOS** can't block screenshots. `AppDelegate.swift` reports screen recording or mirroring, and the viewer blurs the document meanwhile. Check this on a device when the iOS build is set up on a Mac.
- **Notifications:** the bell on home, with an unread badge that updates live (`notification:new`). Opening the list marks them read, and tapping one opens its booking. A tapped push with a `bookingId` opens the booking too.

## Payments & payouts (Phase 7b)

- **Pay:** a booking waiting for payment has **Pay ₹X**.
  - With `PAYMENT_PROVIDER=razorpay` on the API, it opens Razorpay's checkout (`razorpay_flutter`: cards, UPI, netbanking).
  - With the API's default fake provider, a **test checkout** sheet appears instead: Pay, or simulate a failure. No real money moves.
  - A processing screen then waits for the confirmation. The booking page shows the pickup address (borrower), the payment and any refunds.
- **Cancel** on a paid booking shows what comes back before confirming (the API's `/cancel-preview`).
- **Profile → Earnings & payouts:** what's held, paid out or waiting for a bank account, per booking. **Payouts** sets up the bank account Razorpay pays out to. Only the last 4 digits are kept.
- **Try it locally:** run the API with the fake provider (the default in development) and pay from a booking the lender accepted.
- **Razorpay test mode:** set the API's keys (see `apps/api/README.md`). The Android plugin needs no key in the app, because it comes with each order. Release builds keep Razorpay's classes (`android/app/proguard-rules.pro`).
- **Live payment test** against a local API, with a LIVE listing that doesn't ask for documents and its lender's phone. Clear OTP rate limits between runs.

  ```bash
  flutter test test/live_api_test.dart --dart-define=LIVE_API_URL=http://localhost:3000 \
    --dart-define=LIVE_LISTING_ID=<listing id> --dart-define=LIVE_LENDER_PHONE=<10 digits>
  ```

## Handover, return, disputes & reviews (Phase 8b)

- **At pickup,** the borrower taps **Show handover code**. The lender taps **Hand over**, scans the QR (or types the 6 digits) and takes 2–6 photos of the item.
- **At the return,** it's the other way round (**Show return code** / **Return it**).
- **Late:** the booking shows the late fee so far (1× the daily rate per day, from the deposit).
- **After the return,** the lender has 24 hours to **Report a problem**. The borrower can **Give your side**, and Sajha decides what happens to the deposit.
- **Reviews:** both rate each other after completion. A review is hidden until both have written one, or for a week. Ratings show on listing cards and the item page.
- **Camera:** scanning uses `mobile_scanner`. Android asks for the camera permission, and on iOS `NSCameraUsageDescription` covers scanning.
- **Live test** of handover and return: the same defines as the payment test. It books the next free day, so the listing's next two days must be free.

## Structure

```
lib/
  core/config/     AppConfig from --dart-define (ENV, API_BASE_URL)
  core/network/    dio client for /v1, AuthInterceptor, TokenManager, ApiException,
                   UploadClient (presigned PUT with a separate, token-free client)
  core/media/      PhotoPicker (camera/gallery/multi-pick + square crop; faked in tests)
  core/location/   LocationService (geolocator; faked in tests)
  core/storage/    refresh token + device id (secure storage), app prefs
  core/router/     go_router routes
  core/theme/      Material theme; tokens.g.dart is GENERATED by `pnpm tokens` — don't edit
  core/effects/    ShaderBackground (shaders/aurora.frag) and other visual effects
  features/<name>/ data · application · presentation
                   (auth, home, discovery, chat, bookings, payments, rentals, profile,
                   documents, listings, settings, onboarding, splash)
  core/realtime/   RealtimeClient (Socket.IO to /ws; faked in tests)
  core/push/       PushService (no-op; FirebasePushService when configured; faked in tests)
  core/payments/   PaymentGateway (Razorpay checkout via razorpay_flutter; faked in tests)
  core/scanner/    CodeScanner (QR scanning via mobile_scanner; faked in tests)
  shared/widgets/  UserAvatar, VerificationBadges, OtpField, date-range chooser
shaders/           GLSL fragment shaders (listed in pubspec.yaml)
config/            per-environment build config
```

The website's uiverse / React Bits / shaders.com effects are web-only, so the app recreates them natively with GLSL shaders (`FragmentProgram`) and `flutter_animate` (see docs/PLAN.md §2).
