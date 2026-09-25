import 'package:sajha/core/links/links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/app.dart';
import 'package:sajha/core/config/app_config.dart';
import 'package:sajha/core/config/providers.dart';
import 'package:sajha/core/device/device_info.dart';
import 'package:sajha/core/location/location_service.dart';
import 'package:sajha/core/media/photo_picker.dart';
import 'package:sajha/features/listings/presentation/pickup_map.dart';
import 'package:sajha/core/network/api_client.dart';
import 'package:sajha/core/payments/payment_gateway.dart';
import 'package:sajha/core/push/push_service.dart';
import 'package:sajha/core/realtime/realtime_client.dart';
import 'package:sajha/core/scanner/code_scanner.dart';
import 'package:sajha/core/security/screen_protection.dart';
import 'package:sajha/core/storage/app_prefs.dart';
import 'package:sajha/core/storage/session_storage.dart';
import 'package:sajha/features/splash/presentation/splash_screen.dart';
import 'package:sajha/shared/widgets/date_range_chooser.dart';

import 'fake_api.dart';
import 'fakes.dart';

class TestHarness {
  TestHarness({
    FakeSajhaApi? api,
    InMemorySessionStorage? storage,
    FakeAppPrefs? prefs,
    FakePhotoPicker? picker,
    FakeLocationService? location,
    this.env = AppEnv.dev,
  }) : api = api ?? FakeSajhaApi(),
       location = location ?? FakeLocationService(),
       picker = picker ?? FakePhotoPicker(),
       storage = storage ?? InMemorySessionStorage(),
       prefs = prefs ?? FakeAppPrefs();

  final FakeSajhaApi api;

  /// The build flavour the app thinks it is (prod hides the debug banner).
  final AppEnv env;
  final InMemorySessionStorage storage;
  final FakeAppPrefs prefs;
  final FakePhotoPicker picker;
  final FakeLocationService location;
  late final FakeRealtime realtime = FakeRealtime(api);
  final push = FakePushService();
  final screen = FakeScreenProtection();
  final gateway = FakePaymentGateway();
  late ProviderContainer container;

  /// Links opened in the browser, in order.
  final openedLinks = <Uri>[];

  /// What the next QR scan returns; null means the person backed out.
  String? nextScan;
  int scans = 0;

  /// What the next date-range pick returns; null means cancelled.
  DateTimeRange? nextDates;

  /// What the last date-range pick allowed, to check blocked days.
  bool Function(DateTime day)? lastSelectable;

  List<Override> get overrides => [
    appConfigProvider.overrideWithValue(
      AppConfig(env: env, apiBaseUrl: 'http://api.test'),
    ),
    httpClientAdapterProvider.overrideWithValue(api),
    sessionStorageProvider.overrideWithValue(storage),
    appPrefsProvider.overrideWithValue(prefs),
    deviceInfoProvider.overrideWithValue(FakeDeviceInfo()),
    photoPickerProvider.overrideWithValue(picker),
    locationServiceProvider.overrideWithValue(location),
    mapTilesEnabledProvider.overrideWithValue(false),
    realtimeClientProvider.overrideWithValue(realtime),
    pushServiceProvider.overrideWithValue(push),
    screenProtectionProvider.overrideWithValue(screen),
    paymentGatewayProvider.overrideWithValue(gateway),
    linkOpenerProvider.overrideWithValue((uri) async {
      openedLinks.add(uri);
      return true;
    }),
    codeScannerProvider.overrideWithValue((_) async {
      scans++;
      return nextScan;
    }),
    dateRangeChooserProvider.overrideWithValue((
      context, {
      required first,
      required last,
      initial,
      selectable,
    }) async {
      lastSelectable = selectable;
      return nextDates;
    }),
  ];

  /// Boots the whole app and lets the splash finish.
  Future<void> start(WidgetTester tester) async {
    container = ProviderContainer(overrides: overrides);
    addTearDown(container.dispose);
    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: const SajhaApp()),
    );
    await tester.pump(SplashScreen.duration);
    await settle(tester);
  }
}

/// The app has endless animations (shader, gradient button), so
/// pumpAndSettle would never return. Pump a fixed amount of time instead.
Future<void> settle(WidgetTester tester, [int frames = 12]) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> enterText(WidgetTester tester, String key, String text) async {
  await tester.enterText(find.byKey(ValueKey(key)), text);
  await settle(tester, 3);
}

Future<void> tapText(WidgetTester tester, String text) async {
  await tester.tap(find.text(text).last);
  await settle(tester);
}

/// Taps the keyed widget, scrolling it into view first when it's in a list.
Future<void> tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(ValueKey(key));
  if (finder.evaluate().isEmpty) {
    // Not built yet: lists build lazily, so scroll the visible list to it.
    // Vertical lists only: feeds hold horizontal card rows too.
    await tester.scrollUntilVisible(
      finder,
      200,
      scrollable: find
          .byWidgetPredicate(
            (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
          )
          .hitTestable()
          .last,
    );
  }
  await tester.ensureVisible(finder);
  await settle(tester, 3);
  await tester.tap(finder);
  await settle(tester);
}
