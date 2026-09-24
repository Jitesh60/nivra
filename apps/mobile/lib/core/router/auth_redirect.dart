import '../../features/auth/application/auth_controller.dart';
import 'routes.dart';

/// Where to send the user for [location] given the auth state, or null to stay.
/// Kept as a pure function so every rule is unit-tested.
String? authRedirect(AuthState auth, String location) {
  switch (auth) {
    case AuthUnknown():
      return location == Routes.splash ? null : Routes.splash;

    case Unauthenticated(:final onboardingSeen):
      if (location == Routes.onboarding && onboardingSeen) return Routes.login;
      if (Routes.public.contains(location)) return null;
      return onboardingSeen ? Routes.login : Routes.onboarding;

    case final Authenticated a:
      if (a.needsName) {
        return location == Routes.setupName ? null : Routes.setupName;
      }
      if (a.user.emailVerified && location.startsWith(Routes.setupEmail)) {
        return Routes.home;
      }
      final inSignInFlow =
          location == Routes.splash ||
          location == Routes.setupName ||
          Routes.public.contains(location);
      if (inSignInFlow) return a.needsEmail ? Routes.setupEmail : Routes.home;
      return null;
  }
}
