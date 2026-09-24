import 'package:flutter/material.dart';
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

final _emailPattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$');

bool isValidEmail(String value) => _emailPattern.hasMatch(value.trim());

/// Add and verify an email. Optional for browsing; required before listing
/// or booking (enforced when those features arrive).
class EmailScreen extends ConsumerStatefulWidget {
  const EmailScreen({super.key});

  @override
  ConsumerState<EmailScreen> createState() => _EmailScreenState();
}

class _EmailScreenState extends ConsumerState<EmailScreen> {
  final _email = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _email.addListener(() => setState(() => _error = null));
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _email.text.trim().toLowerCase();
    setState(() => _loading = true);
    try {
      final challenge = await ref
          .read(authRepositoryProvider)
          .requestEmailOtp(email);
      if (!mounted) return;
      context.push(
        Routes.setupEmailVerify,
        extra: EmailOtpArgs(email, challenge),
      );
    } on ApiException catch (e) {
      setState(() => _error = e.friendlyMessage);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _later() {
    final returnTo = ref.read(signInReturnProvider);
    ref.read(signInReturnProvider.notifier).clear();
    ref.read(authControllerProvider.notifier).skipEmail();
    context.go(returnTo ?? Routes.home);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final valid = isValidEmail(_email.text);

    return Scaffold(
      appBar: AppBar(
        actions: [
          TextButton(
            key: const ValueKey('email-later'),
            onPressed: _later,
            child: const Text('Later'),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(SajhaSpacing.lg),
          children: [
            Text('Add your email', style: text.headlineSmall),
            const SizedBox(height: SajhaSpacing.sm),
            Text(
              'You’ll need a verified email to list or rent items. We’ll send a code to confirm it.',
              style: text.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            TextField(
              key: const ValueKey('email-input'),
              controller: _email,
              autofocus: true,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              autocorrect: false,
              decoration: InputDecoration(
                labelText: 'Email',
                errorText: _error,
              ),
              onSubmitted: (_) => valid ? _submit() : null,
            ),
            const SizedBox(height: SajhaSpacing.lg),
            GradientButton(
              label: 'Send code',
              loading: _loading,
              onPressed: valid && !_loading ? _submit : null,
            ),
          ],
        ),
      ),
    );
  }
}
