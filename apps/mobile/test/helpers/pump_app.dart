import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/app.dart';
import 'package:sajha/core/config/app_config.dart';
import 'package:sajha/core/config/providers.dart';
import 'package:sajha/core/device/device_info.dart';
import 'package:sajha/core/network/api_client.dart';
import 'package:sajha/core/storage/app_prefs.dart';
import 'package:sajha/core/storage/session_storage.dart';
import 'package:sajha/features/splash/presentation/splash_screen.dart';

import 'fake_api.dart';
import 'fakes.dart';

class TestHarness {
  TestHarness({
    FakeSajhaApi? api,
    InMemorySessionStorage? storage,
    FakeAppPrefs? prefs,
  }) : api = api ?? FakeSajhaApi(),
       storage = storage ?? InMemorySessionStorage(),
       prefs = prefs ?? FakeAppPrefs();

  final FakeSajhaApi api;
  final InMemorySessionStorage storage;
  final FakeAppPrefs prefs;
  late ProviderContainer container;

  List<Override> get overrides => [
    appConfigProvider.overrideWithValue(
      const AppConfig(env: AppEnv.dev, apiBaseUrl: 'http://api.test'),
    ),
    httpClientAdapterProvider.overrideWithValue(api),
    sessionStorageProvider.overrideWithValue(storage),
    appPrefsProvider.overrideWithValue(prefs),
    deviceInfoProvider.overrideWithValue(FakeDeviceInfo()),
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
