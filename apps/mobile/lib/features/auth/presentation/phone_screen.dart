import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/effects/gradient_button.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/router/sign_in_return.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';
import 'otp_screens.dart';

/// Indian mobile numbers: 10 digits starting 6–9.
bool isValidIndianMobile(String digits) =>
    RegExp(r'^[6-9]\d{9}$').hasMatch(digits);

class PhoneScreen extends ConsumerStatefulWidget {
  const PhoneScreen({super.key});

  @override
  ConsumerState<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends ConsumerState<PhoneScreen> {
  final _phone = TextEditingController();
  bool _agreed = false;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _phone.addListener(() => setState(() => _error = null));
  }

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _agreed && isValidIndianMobile(_phone.text) && !_loading;

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      final challenge = await ref
          .read(authRepositoryProvider)
          .requestPhoneOtp(_phone.text);
      if (!mounted) return;
      context.push(
        Routes.loginVerify,
        extra: PhoneOtpArgs(_phone.text, challenge),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.friendlyMessage);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final auth = ref.watch(authControllerProvider);
    final notice = auth is Unauthenticated ? auth.message : null;
    final typed = _phone.text;
    final showFormatHint = typed.length == 10 && !isValidIndianMobile(typed);

    final returning = ref.watch(signInReturnProvider) != null;

    final screen = Scaffold(
      appBar: AppBar(
        leading: returning
            ? IconButton(
                key: const ValueKey('cancel-sign-in'),
                tooltip: 'Not now',
                icon: const Icon(Icons.close),
                onPressed: () => cancelSignIn(context, ref),
              )
            : null,
        actions: [
          // First run lands here; guests may look around before signing in.
          if (!returning && !context.canPop())
            TextButton(
              key: const ValueKey('browse-as-guest'),
              onPressed: () => cancelSignIn(context, ref),
              child: const Text('Browse first'),
            ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(SajhaSpacing.lg),
          children: [
            if (notice != null)
              Padding(
                padding: const EdgeInsets.only(bottom: SajhaSpacing.md),
                child: MaterialBanner(
                  content: Text(notice),
                  leading: const Icon(Icons.info_outline),
                  actions: const [SizedBox.shrink()],
                ),
              ),
            Text('Enter your mobile number', style: text.headlineSmall),
            const SizedBox(height: SajhaSpacing.sm),
            Text(
              returning
                  ? 'Sign in to save items and rent from lenders. We’ll send '
                        'a 6-digit code, then bring you right back.'
                  : 'We’ll send a 6-digit code to verify it’s you.',
              style: text.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            TextField(
              key: const ValueKey('phone-input'),
              controller: _phone,
              autofocus: true,
              keyboardType: TextInputType.phone,
              autofillHints: const [AutofillHints.telephoneNumberNational],
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(10),
              ],
              style: text.titleLarge,
              decoration: InputDecoration(
                prefixText: '+91  ',
                hintText: '98765 43210',
                errorText:
                    _error ??
                    (showFormatHint
                        ? 'Indian mobile numbers start with 6, 7, 8 or 9'
                        : null),
              ),
              onSubmitted: (_) => _canSubmit ? _submit() : null,
            ),
            const SizedBox(height: SajhaSpacing.md),
            CheckboxListTile(
              key: const ValueKey('consent'),
              value: _agreed,
              onChanged: (v) => setState(() => _agreed = v ?? false),
              contentPadding: EdgeInsets.zero,
              controlAffinity: ListTileControlAffinity.leading,
              // The whole row toggles the box. Terms and Privacy become links
              // once the website pages exist (Phase 1d).
              title: Text(
                'I agree to the Terms of Service and Privacy Policy',
                style: text.bodyMedium,
              ),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            GradientButton(
              label: 'Send code',
              loading: _loading,
              onPressed: _canSubmit ? _submit : null,
            ),
          ],
        ),
      ),
    );
    // System back while signing in for something goes back to it.
    return PopScope(
      canPop: !returning,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) cancelSignIn(context, ref);
      },
      child: screen,
    );
  }
}
