# Store kit

Everything the Play Console and App Store Connect ask for, kept next to the code so it changes when the app does. Upload steps are in [docs/RELEASE.md](../../../docs/RELEASE.md).

| File | Where it goes |
|---|---|
| [listing.md](listing.md) | Play: Main store listing. App Store: name, subtitle, promotional text, description, keywords |
| [data-safety.md](data-safety.md) | Play Console → App content → Data safety |
| [app-privacy.md](app-privacy.md) | App Store Connect → App Privacy |
| [content-rating.md](content-rating.md) | Play: Content rating questionnaire. App Store: Age rating |
| `screenshots/` | Phone screenshots, 1080×2400 (Play accepts 16:9 to 9:16; the App Store needs 1290×2796 for 6.7″, exported from the same test at that size) |
| `../assets/brand/store-icon-512.png` | Play: app icon (512×512). The App Store takes the 1024 icon from the build |

## Screenshots

Rendered from the real screens against the fake API, with placeholder listing photos (`photos/`):

```bash
flutter test test/store --update-goldens --dart-define=STORE_SCREENSHOTS=true
```

Replace the placeholder photos with real listing photos (with the lenders' permission) before launch, then run it again. For the App Store 6.7″ size, change the `physicalSize` in `test/store/store_screenshots_test.dart` to `Size(1290, 2796)`.

## Feature graphic (Play, 1024×500)

Not generated: make it from `assets/brand/sajha-mark.svg` on the brand green (`#11846A`) with the tagline "Borrow what you need, lend what you don't use."
