import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/effects/gradient_button.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';

/// First-login profile step: the name other users will see.
class NameScreen extends ConsumerStatefulWidget {
  const NameScreen({super.key});

  @override
  ConsumerState<NameScreen> createState() => _NameScreenState();
}

class _NameScreenState extends ConsumerState<NameScreen> {
  final _name = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _name.addListener(() => setState(() => _error = null));
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  bool get _valid => _name.text.trim().length >= 2;

  Future<void> _submit() async {
    setState(() => _loading = true);
    try {
      final user = await ref
          .read(authRepositoryProvider)
          .updateName(_name.text.trim());
      ref.read(authControllerProvider.notifier).userUpdated(user);
    } on ApiException catch (e) {
      setState(() => _error = e.friendlyMessage);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(SajhaSpacing.lg),
          children: [
            const SizedBox(height: SajhaSpacing.xl),
            Text('What should we call you?', style: text.headlineSmall),
            const SizedBox(height: SajhaSpacing.sm),
            Text(
              'Lenders and borrowers see this name.',
              style: text.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            TextField(
              key: const ValueKey('name-input'),
              controller: _name,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              maxLength: 80,
              decoration: InputDecoration(
                labelText: 'Full name',
                errorText: _error,
                counterText: '',
              ),
              onSubmitted: (_) => _valid ? _submit() : null,
            ),
            const SizedBox(height: SajhaSpacing.lg),
            GradientButton(
              label: 'Continue',
              loading: _loading,
              onPressed: _valid && !_loading ? _submit : null,
            ),
          ],
        ),
      ),
    );
  }
}
