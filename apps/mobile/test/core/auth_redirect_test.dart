import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/router/auth_redirect.dart';
import 'package:sajha/core/router/routes.dart';
import 'package:sajha/features/auth/application/auth_controller.dart';
import 'package:sajha/features/auth/data/models.dart';

AppUser user({String? name = 'Rahul', bool emailVerified = false}) => AppUser(
  id: 'u1',
  phone: '+919876543210',
  name: name,
  phoneVerified: true,
  emailVerified: emailVerified,
);

void main() {
  test('unknown state stays on the splash', () {
    expect(authRedirect(const AuthUnknown(), Routes.splash), isNull);
    expect(authRedirect(const AuthUnknown(), Routes.home), Routes.splash);
  });

  test('signed-out users see onboarding once, then login', () {
    expect(
      authRedirect(const Unauthenticated(onboardingSeen: false), Routes.splash),
      Routes.onboarding,
    );
    expect(
      authRedirect(const Unauthenticated(onboardingSeen: true), Routes.splash),
      Routes.login,
    );
    expect(
      authRedirect(const Unauthenticated(onboardingSeen: true), Routes.home),
      Routes.login,
    );
    expect(
      authRedirect(
        const Unauthenticated(onboardingSeen: true),
        Routes.loginVerify,
      ),
      isNull,
    );
  });

  test('new users must set a name first', () {
    final auth = Authenticated(user(name: null));
    expect(authRedirect(auth, Routes.loginVerify), Routes.setupName);
    expect(authRedirect(auth, Routes.home), Routes.setupName);
    expect(authRedirect(auth, Routes.setupName), isNull);
  });

  test('after the name, unverified users are asked for their email once', () {
    expect(
      authRedirect(Authenticated(user()), Routes.setupName),
      Routes.setupEmail,
    );
    final skipped = Authenticated(user(), emailPromptSkipped: true);
    expect(authRedirect(skipped, Routes.loginVerify), Routes.home);
    // They can still open the email screen from home.
    expect(authRedirect(skipped, Routes.setupEmail), isNull);
  });

  test('verified users go home and never back to setup', () {
    final auth = Authenticated(user(emailVerified: true));
    expect(authRedirect(auth, Routes.splash), Routes.home);
    expect(authRedirect(auth, Routes.setupEmailVerify), Routes.home);
    expect(authRedirect(auth, Routes.settings), isNull);
  });
}
