import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/user_avatar.dart';
import '../../../shared/widgets/verification_badges.dart';
import '../../auth/application/auth_controller.dart';

/// Greeting, profile and verification status. Browsing and listing arrive
/// in Phases 3–4.
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
            key: const ValueKey('open-profile'),
            tooltip: 'Profile',
            icon: UserAvatar(user: user, radius: 14),
            onPressed: () => context.push(Routes.profile),
          ),
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
                  VerificationBadges(user: user),
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
                  ] else if (!user.idVerified) ...[
                    const SizedBox(height: SajhaSpacing.md),
                    Text(
                      'Add an ID so lenders know who they’re renting to. '
                      'It stays private until you choose to share it.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: SajhaSpacing.sm),
                    FilledButton.tonal(
                      key: const ValueKey('add-id'),
                      onPressed: () => context.push(Routes.documents),
                      child: const Text('Add an ID'),
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
