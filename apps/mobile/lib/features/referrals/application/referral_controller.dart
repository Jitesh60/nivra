import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../discovery/application/discovery_providers.dart';
import '../data/referrals.dart';

/// Your invite code and credit; null when signed out. Redeeming a code
/// shows the new balance straight from the API's answer.
class ReferralController extends AsyncNotifier<Referral?> {
  @override
  Future<Referral?> build() async {
    if (!ref.watch(signedInProvider)) return null;
    return ref.read(referralsRepositoryProvider).get();
  }

  Future<void> redeem(String code) async {
    final updated = await ref.read(referralsRepositoryProvider).redeem(code);
    state = AsyncData(updated);
  }
}

final referralProvider = AsyncNotifierProvider<ReferralController, Referral?>(
  ReferralController.new,
  retry: noRetry,
);

/// "Have an invite code?" on Home was closed (until the app restarts).
class InviteCardDismissed extends Notifier<bool> {
  @override
  bool build() => false;

  void dismiss() => state = true;
}

final inviteCardDismissedProvider = NotifierProvider<InviteCardDismissed, bool>(
  InviteCardDismissed.new,
);
