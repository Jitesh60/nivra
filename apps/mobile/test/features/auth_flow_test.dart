import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';
import 'package:sajha/features/auth/presentation/email_screen.dart';
import 'package:sajha/features/auth/presentation/otp_screens.dart';

import '../helpers/fake_api.dart';
import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  /// The page on top (pushed pages included).
  String location(TestHarness h) =>
      h.container.read(routerProvider).state.uri.path;

  /// Returning guests land on home; sign-in is one tap away.
  Future<void> openSignIn(WidgetTester tester, TestHarness h) async {
    expect(location(h), Routes.home);
    await tester.tap(find.byKey(const ValueKey('home-sign-in')));
    await settle(tester);
    expect(location(h), Routes.login);
  }

  Future<void> signInWithPhone(
    WidgetTester tester, {
    String phone = '9876543210',
  }) async {
    await enterText(tester, 'phone-input', phone);
    await tester.tap(find.byKey(const ValueKey('consent')));
    await settle(tester, 2);
    await tapText(tester, 'Send code');
    await enterText(tester, 'otp-input', FakeSajhaApi.code);
    await settle(tester);
  }

  testWidgets('new user: onboarding → phone → code → name → email → home', (
    tester,
  ) async {
    final h = TestHarness();
    await h.start(tester);
    expect(location(h), Routes.onboarding);

    await tapText(tester, 'Skip');
    expect(location(h), Routes.login);
    expect(h.prefs.seen, isTrue);

    // "Send code" stays disabled until the number is valid and terms are accepted.
    await enterText(tester, 'phone-input', '98765');
    await tapText(tester, 'Send code');
    expect(location(h), Routes.login);

    await signInWithPhone(tester);
    expect(location(h), Routes.setupName);
    expect(h.storage.refreshToken, isNotNull);

    await enterText(tester, 'name-input', 'Rahul Sharma');
    await tapText(tester, 'Continue');
    expect(location(h), Routes.setupEmail);

    await enterText(tester, 'email-input', 'rahul@example.com');
    await tapText(tester, 'Send code');
    expect(find.byType(EmailOtpScreen), findsOneWidget);
    expect(
      find.textContaining('rahul@example.com', findRichText: true),
      findsOneWidget,
    );

    await enterText(tester, 'otp-input', FakeSajhaApi.code);
    await settle(tester);
    expect(location(h), Routes.home);
    expect(find.text('Hi, Rahul 👋'), findsOneWidget);
    expect(find.text('Phone verified'), findsOneWidget);
    expect(find.text('Email verified'), findsOneWidget);
  });

  testWidgets('existing user signs in with phone and code only', (
    tester,
  ) async {
    final h = TestHarness(prefs: FakeAppPrefs(seen: true));
    h.api.seedSession(phone: '+919876543210');
    await h.start(tester);
    await openSignIn(tester, h);

    await signInWithPhone(tester);
    expect(location(h), Routes.home);
  });

  testWidgets('a wrong code shows tries left and can be corrected', (
    tester,
  ) async {
    final h = TestHarness(prefs: FakeAppPrefs(seen: true));
    await h.start(tester);
    await openSignIn(tester, h);
    await enterText(tester, 'phone-input', '9876543210');
    await tester.tap(find.byKey(const ValueKey('consent')));
    await settle(tester, 2);
    await tapText(tester, 'Send code');

    await enterText(tester, 'otp-input', '000000');
    await settle(tester);
    expect(find.text('That code isn’t right. 4 tries left.'), findsOneWidget);
    expect(find.byType(PhoneOtpScreen), findsOneWidget);

    await enterText(tester, 'otp-input', FakeSajhaApi.code);
    await settle(tester);
    expect(location(h), Routes.setupName);
  });

  testWidgets('resend is locked for 30 seconds', (tester) async {
    final h = TestHarness(prefs: FakeAppPrefs(seen: true));
    await h.start(tester);
    await openSignIn(tester, h);
    await enterText(tester, 'phone-input', '9876543210');
    await tester.tap(find.byKey(const ValueKey('consent')));
    await settle(tester, 2);
    await tapText(tester, 'Send code');

    expect(find.textContaining('Resend code in'), findsOneWidget);
    await tester.pump(const Duration(seconds: 31));
    await settle(tester, 2);
    expect(find.text('Resend code'), findsOneWidget);
    await tapText(tester, 'Resend code');
    expect(
      h.api.requests.where((r) => r == 'POST /auth/otp/request'),
      hasLength(2),
    );
  });

  testWidgets('email can be skipped, then verified later from home', (
    tester,
  ) async {
    final h = TestHarness(prefs: FakeAppPrefs(seen: true));
    await h.start(tester);
    await openSignIn(tester, h);
    await signInWithPhone(tester);
    await enterText(tester, 'name-input', 'Priya');
    await tapText(tester, 'Continue');

    await tester.tap(find.byKey(const ValueKey('email-later')));
    await settle(tester);
    expect(location(h), Routes.home);
    expect(find.text('Email not verified'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('verify-email')));
    await settle(tester);
    expect(find.byType(EmailScreen), findsOneWidget);
  });

  testWidgets('a stored session survives restart and refreshes silently', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final h = TestHarness(
      api: api,
      storage: InMemorySessionStorage(refreshToken: api.seedSession()),
      prefs: FakeAppPrefs(seen: true),
    );
    await h.start(tester);
    expect(location(h), Routes.home);

    // Access token expires while the app is open: the next call refreshes.
    api.expireAccessTokens();
    await tester.tap(find.byTooltip('Settings'));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('devices')));
    await settle(tester);
    expect(find.text('This device'), findsOneWidget);
    expect(api.refreshCalls, 2); // once at start, once after expiry
  });

  testWidgets('a session revoked elsewhere sends the user to login', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final h = TestHarness(
      api: api,
      storage: InMemorySessionStorage(refreshToken: api.seedSession()),
      prefs: FakeAppPrefs(seen: true),
    );
    await h.start(tester);
    expect(location(h), Routes.home);

    api.revokeAllSessions();
    await tester.tap(find.byTooltip('Settings'));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('devices')));
    await settle(tester);

    expect(location(h), Routes.login);
    expect(
      find.text('Your session ended. Please sign in again.'),
      findsOneWidget,
    );
    expect(h.storage.refreshToken, isNull);
  });

  testWidgets('offline at start offers a retry', (tester) async {
    final api = FakeSajhaApi();
    final h = TestHarness(
      api: api,
      storage: InMemorySessionStorage(refreshToken: api.seedSession()),
    );
    api.offline = true;
    await h.start(tester);
    expect(location(h), Routes.splash);
    expect(
      find.text('Can’t reach Sajha. Check your internet connection.'),
      findsOneWidget,
    );

    api.offline = false;
    await tester.tap(find.text('Try again'));
    await tester.pump(const Duration(seconds: 2));
    await settle(tester);
    expect(location(h), Routes.home);
  });

  testWidgets('log out, log out everywhere and delete account', (tester) async {
    Future<TestHarness> signedIn() async {
      final api = FakeSajhaApi();
      final h = TestHarness(
        api: api,
        storage: InMemorySessionStorage(refreshToken: api.seedSession()),
        prefs: FakeAppPrefs(seen: true),
      );
      await h.start(tester);
      await tester.tap(find.byTooltip('Settings'));
      await settle(tester);
      return h;
    }

    var h = await signedIn();
    await tester.tap(find.byKey(const ValueKey('logout')));
    await settle(tester);
    expect(location(h), Routes.login);
    expect(h.api.requests, contains('POST /auth/logout'));
    expect(h.storage.refreshToken, isNull);

    h = await signedIn();
    await tester.tap(find.byKey(const ValueKey('logout-all')));
    await settle(tester);
    await tapText(tester, 'Log out all');
    expect(location(h), Routes.login);
    expect(h.api.requests, contains('POST /auth/logout-all'));

    h = await signedIn();
    await tester.tap(find.byKey(const ValueKey('delete-account')));
    await settle(tester);
    await tapText(tester, 'Delete');
    expect(location(h), Routes.login);
    expect(h.api.requests, contains('DELETE /me'));
    expect(find.text('Your account has been deleted.'), findsOneWidget);
  });

  testWidgets('shows a friendly error for an invalid number from the server', (
    tester,
  ) async {
    final h = TestHarness(prefs: FakeAppPrefs(seen: true));
    await h.start(tester);
    await openSignIn(tester, h);
    expect(
      find.text('Indian mobile numbers start with 6, 7, 8 or 9'),
      findsNothing,
    );
    await enterText(tester, 'phone-input', '5876543210');
    expect(
      find.text('Indian mobile numbers start with 6, 7, 8 or 9'),
      findsOneWidget,
    );
  });
}
