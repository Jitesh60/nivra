import '../../features/auth/application/auth_controller.dart';
import 'routes.dart';

/// Where to send the user for [location] given the auth state, or null to stay.
/// [returnTo] is where a guest was when sign-in was asked for; they go back
/// there once signed in. Kept as a pure function so every rule is unit-tested.
String? authRedirect(AuthState auth, String location, {String? returnTo}) {
  switch (auth) {
    case AuthUnknown():
      return location == Routes.splash ? null : Routes.splash;

    case Unauthenticated(:final onboardingSeen):
      if (location == Routes.onboarding && onboardingSeen) return Routes.login;
      if (Routes.public.contains(location)) return null;
      if (!onboardingSeen) return Routes.onboarding;
      // Returning guests browse; sign-in is asked for when they save or book.
      if (location == Routes.splash) return Routes.home;
      return Routes.isBrowse(location) ? null : Routes.login;

    case final Authenticated a:
      final done = returnTo ?? Routes.home;
      if (a.needsName) {
        return location == Routes.setupName ? null : Routes.setupName;
      }
      if (a.user.emailVerified && location.startsWith(Routes.setupEmail)) {
        return done;
      }
      final inSignInFlow =
          location == Routes.splash ||
          location == Routes.setupName ||
          Routes.public.contains(location);
      if (inSignInFlow) return a.needsEmail ? Routes.setupEmail : done;
      return null;
  }
}
