import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'routes.dart';

/// Where to take a guest once they finish signing in (e.g. back to the item
/// they tried to save). The router reads it in `authRedirect`.
class SignInReturn extends Notifier<String?> {
  @override
  String? build() => null;

  void set(String location) => state = location;
  void clear() => state = null;
}

final signInReturnProvider = NotifierProvider<SignInReturn, String?>(
  SignInReturn.new,
);

/// Opens sign-in for a guest and brings them back to [returnTo] afterwards.
/// Sign-in replaces the stack (rather than being pushed) so the router's
/// auth redirects always see it; cancelling goes back to [returnTo].
void requireSignIn(BuildContext context, WidgetRef ref, String returnTo) {
  ref.read(signInReturnProvider.notifier).set(returnTo);
  context.go(Routes.login);
}

/// Leaves sign-in without signing in: back to where the guest was.
void cancelSignIn(BuildContext context, WidgetRef ref) {
  final returnTo = ref.read(signInReturnProvider);
  ref.read(signInReturnProvider.notifier).clear();
  // Drop "?save=1": nothing is saved without an account.
  context.go(returnTo == null ? Routes.home : Uri.parse(returnTo).path);
}
