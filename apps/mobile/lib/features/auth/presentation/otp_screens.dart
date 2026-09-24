import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/auth_controller.dart';
import '../data/auth_repository.dart';
import '../data/models.dart';
import 'otp_verify_screen.dart';

class PhoneOtpArgs {
  const PhoneOtpArgs(this.phone, this.challenge);

  /// 10-digit national number.
  final String phone;
  final OtpChallenge challenge;
}

class EmailOtpArgs {
  const EmailOtpArgs(this.email, this.challenge);
  final String email;
  final OtpChallenge challenge;
}

String formatIndianPhone(String digits) =>
    '+91 ${digits.substring(0, 5)} ${digits.substring(5)}';

/// Verifies the SMS code. On success the auth state changes and the router
/// moves on (to name setup for new users, home otherwise).
class PhoneOtpScreen extends ConsumerWidget {
  const PhoneOtpScreen({super.key, required this.args});

  final PhoneOtpArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(authRepositoryProvider);
    return OtpVerifyScreen(
      title: 'Verify your number',
      destination: formatIndianPhone(args.phone),
      challenge: args.challenge,
      verify: (id, code) async {
        final result = await repo.verifyPhoneOtp(id, code);
        ref.read(authControllerProvider.notifier).signedIn(result);
      },
      resend: () => repo.requestPhoneOtp(args.phone),
    );
  }
}

class EmailOtpScreen extends ConsumerWidget {
  const EmailOtpScreen({super.key, required this.args});

  final EmailOtpArgs args;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final repo = ref.read(authRepositoryProvider);
    return OtpVerifyScreen(
      title: 'Check your email',
      destination: args.email,
      challenge: args.challenge,
      verify: (id, code) async {
        final user = await repo.verifyEmailOtp(id, code);
        ref.read(authControllerProvider.notifier).userUpdated(user);
      },
      resend: () => repo.requestEmailOtp(args.email),
    );
  }
}
