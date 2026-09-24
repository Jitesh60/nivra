import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/email_screen.dart';
import '../../features/auth/presentation/name_screen.dart';
import '../../features/auth/presentation/otp_screens.dart';
import '../../features/auth/presentation/phone_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/settings/presentation/devices_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/splash/presentation/splash_screen.dart';
import 'auth_redirect.dart';
import 'routes.dart';

/// App routes. Every navigation passes through [authRedirect], and the router
/// re-evaluates it whenever the auth state changes.
final routerProvider = Provider<GoRouter>((ref) {
  final authChanged = ValueNotifier(0);
  ref.listen(authControllerProvider, (_, _) => authChanged.value++);

  final router = GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: authChanged,
    redirect: (context, state) =>
        authRedirect(ref.read(authControllerProvider), state.matchedLocation),
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(
        path: Routes.onboarding,
        builder: (_, _) => const OnboardingScreen(),
      ),
      GoRoute(path: Routes.login, builder: (_, _) => const PhoneScreen()),
      GoRoute(
        path: Routes.loginVerify,
        redirect: (_, state) =>
            state.extra is PhoneOtpArgs ? null : Routes.login,
        builder: (_, state) =>
            PhoneOtpScreen(args: state.extra! as PhoneOtpArgs),
      ),
      GoRoute(path: Routes.setupName, builder: (_, _) => const NameScreen()),
      GoRoute(path: Routes.setupEmail, builder: (_, _) => const EmailScreen()),
      GoRoute(
        path: Routes.setupEmailVerify,
        redirect: (_, state) =>
            state.extra is EmailOtpArgs ? null : Routes.setupEmail,
        builder: (_, state) =>
            EmailOtpScreen(args: state.extra! as EmailOtpArgs),
      ),
      GoRoute(path: Routes.home, builder: (_, _) => const HomeScreen()),
      GoRoute(path: Routes.settings, builder: (_, _) => const SettingsScreen()),
      GoRoute(path: Routes.devices, builder: (_, _) => const DevicesScreen()),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    authChanged.dispose();
  });
  return router;
});
