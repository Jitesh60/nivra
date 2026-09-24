import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../auth/application/auth_controller.dart';

/// Phase 1 home: greeting and verification status. Browsing and listing
/// arrive in Phases 3–4.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth is! Authenticated) return const SizedBox.shrink();
    final user = auth.user;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sajha'),
        actions: [
          IconButton(
            tooltip: 'Settings',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push(Routes.settings),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        children: [
          Text(
            'Hi, ${user.firstName ?? 'there'} 👋',
            style: text.headlineMedium,
          ),
          const SizedBox(height: SajhaSpacing.lg),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(SajhaSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Verification', style: text.titleMedium),
                  const SizedBox(height: SajhaSpacing.sm),
                  Wrap(
                    spacing: SajhaSpacing.sm,
                    runSpacing: SajhaSpacing.sm,
                    children: [
                      _Badge(label: 'Phone', verified: user.phoneVerified),
                      _Badge(label: 'Email', verified: user.emailVerified),
                    ],
                  ),
                  if (!user.emailVerified) ...[
                    const SizedBox(height: SajhaSpacing.md),
                    Text(
                      'Verify your email to list or rent items.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: SajhaSpacing.sm),
                    FilledButton.tonal(
                      key: const ValueKey('verify-email'),
                      onPressed: () => context.push(Routes.setupEmail),
                      child: const Text('Verify email'),
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: SajhaSpacing.lg),
          Text(
            'Browsing and lending are coming soon.',
            style: text.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.verified});

  final String label;
  final bool verified;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(
        verified ? Icons.verified : Icons.error_outline,
        size: 18,
        color: verified ? SajhaColors.success : SajhaColors.warning,
      ),
      label: Text(verified ? '$label verified' : '$label not verified'),
    );
  }
}
