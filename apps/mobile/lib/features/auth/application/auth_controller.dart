import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/token_manager.dart';
import '../../../core/storage/app_prefs.dart';
import '../data/auth_repository.dart';
import '../data/models.dart';

/// Where the user is in the sign-in lifecycle. The router redirects on it.
sealed class AuthState {
  const AuthState();
}

/// App just started; the stored session hasn't been checked yet.
class AuthUnknown extends AuthState {
  const AuthUnknown({this.error});

  /// Set when the session check failed because of the network.
  final ApiException? error;
}

class Unauthenticated extends AuthState {
  const Unauthenticated({required this.onboardingSeen, this.message});

  final bool onboardingSeen;

  /// Why the user was signed out, when it wasn't their choice.
  final String? message;
}

class Authenticated extends AuthState {
  const Authenticated(this.user, {this.emailPromptSkipped = false});

  final AppUser user;

  /// The user chose "Later" on the email step this session.
  final bool emailPromptSkipped;

  bool get needsName => !user.hasName;
  bool get needsEmail => !user.emailVerified && !emailPromptSkipped;
}

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    ref.read(tokenManagerProvider).onSessionEnded = _sessionEnded;
    return const AuthUnknown();
  }

  AuthRepository get _repo => ref.read(authRepositoryProvider);

  /// Called by the splash screen. The new state is published no sooner than
  /// [minimumDuration], so the splash animation can finish. Network failures
  /// leave the state [AuthUnknown] with an error so the splash can offer a retry.
  Future<void> restore({Duration minimumDuration = Duration.zero}) async {
    final delay = Future<void>.delayed(minimumDuration);
    AuthState next;
    try {
      final user = await _repo.restoreSession();
      next = user != null
          ? Authenticated(user)
          : Unauthenticated(onboardingSeen: await _onboardingSeen());
    } on ApiException catch (e) {
      next = AuthUnknown(error: e);
    }
    await delay;
    state = next;
  }

  Future<void> completeOnboarding() async {
    await ref.read(appPrefsProvider).setOnboardingSeen();
    state = const Unauthenticated(onboardingSeen: true);
  }

  void signedIn(LoginResult result) {
    ref.read(appPrefsProvider).setOnboardingSeen();
    state = Authenticated(result.user);
  }

  void userUpdated(AppUser user) {
    final current = state;
    state = Authenticated(
      user,
      emailPromptSkipped:
          current is Authenticated && current.emailPromptSkipped,
    );
  }

  void skipEmail() {
    final current = state;
    if (current is Authenticated) {
      state = Authenticated(current.user, emailPromptSkipped: true);
    }
  }

  Future<void> logout({bool everywhere = false}) async {
    await _repo.logout(everywhere: everywhere);
    state = const Unauthenticated(onboardingSeen: true);
  }

  Future<void> deleteAccount() async {
    await _repo.deleteAccount();
    state = const Unauthenticated(
      onboardingSeen: true,
      message: 'Your account has been deleted.',
    );
  }

  void _sessionEnded(SessionEndReason reason) {
    if (state is! Authenticated) return;
    state = Unauthenticated(
      onboardingSeen: true,
      message: reason == SessionEndReason.suspended
          ? 'Your account is suspended. Contact support.'
          : 'Your session ended. Please sign in again.',
    );
  }

  Future<bool> _onboardingSeen() async {
    try {
      return await ref.read(appPrefsProvider).onboardingSeen();
    } catch (_) {
      return false;
    }
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);
