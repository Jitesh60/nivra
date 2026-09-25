import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/links/links.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  Future<TestHarness> settings(WidgetTester tester) async {
    final h = TestHarness(prefs: FakeAppPrefs(seen: true));
    h.storage.refreshToken = h.api.seedSession();
    await h.start(tester);
    h.container.read(routerProvider).push(Routes.settings);
    await settle(tester);
    return h;
  }

  bool switchOn(WidgetTester tester, String name) =>
      tester.widget<SwitchListTile>(find.byKey(ValueKey('pref-$name'))).value;

  testWidgets('notifications: flip a switch and it is saved', (tester) async {
    final h = await settings(tester);
    await tapKey(tester, 'settings-notifications');
    expect(h.api.requests, contains('GET /me/notification-preferences'));
    expect(switchOn(tester, 'pushChat'), isTrue);
    expect(
      find.textContaining('Everything still shows in the bell'),
      findsOneWidget,
    );

    await tapKey(tester, 'pref-pushChat');
    expect(switchOn(tester, 'pushChat'), isFalse);
    expect(h.api.notificationPrefs[h.api.appUserId]!['pushChat'], isFalse);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('pref-marketing')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(switchOn(tester, 'marketing'), isFalse);
    await tapKey(tester, 'pref-marketing');
    expect(h.api.notificationPrefs[h.api.appUserId], {
      'pushBookings': true,
      'pushChat': false,
      'pushReminders': true,
      'emailBookings': true,
      'smsReminders': true,
      'marketing': true,
    });
  });

  testWidgets('notifications: a failed save flips back and says why', (
    tester,
  ) async {
    final h = await settings(tester);
    await tapKey(tester, 'settings-notifications');
    h.api.failPrefs = true;
    await tapKey(tester, 'pref-pushBookings');
    expect(switchOn(tester, 'pushBookings'), isTrue);
    expect(find.byType(SnackBar), findsOneWidget);
    expect(h.api.notificationPrefs[h.api.appUserId]!['pushBookings'], isTrue);
  });

  testWidgets('help, terms, privacy and deletion open on the website', (
    tester,
  ) async {
    final h = await settings(tester);
    for (final key in ['link-help', 'link-terms', 'link-privacy']) {
      await tester.scrollUntilVisible(
        find.byKey(ValueKey(key)),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tapKey(tester, key);
    }
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('app-version')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tapKey(tester, 'link-delete-info');
    expect(h.openedLinks, [
      SajhaLinks.help,
      SajhaLinks.terms,
      SajhaLinks.privacy,
      SajhaLinks.deleteAccount,
    ]);
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('app-version'))).data,
      startsWith('Sajha '),
    );
  });
}
