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

  Future<void> _verifyFirst(BuildContext context) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Verify your email first'),
        content: const Text(
          'Lenders need a verified phone and email, so borrowers can trust them.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Later'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Verify email'),
          ),
        ],
      ),
    );
    if ((go ?? false) && context.mounted) context.push(Routes.setupEmail);
  }

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
          Card(
            child: Padding(
              padding: const EdgeInsets.all(SajhaSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Lend your things', style: text.titleMedium),
                  const SizedBox(height: SajhaSpacing.xs),
                  Text(
                    'Earn from gear you rarely use. You set the price, dates '
                    'and deposit.',
                    style: text.bodyMedium,
                  ),
                  const SizedBox(height: SajhaSpacing.md),
                  Row(
                    children: [
                      FilledButton.icon(
                        key: const ValueKey('list-item'),
                        // The theme's buttons are full-width; this one sits in a row.
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 48),
                        ),
                        onPressed: () => user.emailVerified
                            ? context.push(Routes.newListing)
                            : _verifyFirst(context),
                        icon: const Icon(Icons.add),
                        label: const Text('List an item'),
                      ),
                      const SizedBox(width: SajhaSpacing.sm),
                      TextButton(
                        key: const ValueKey('my-listings'),
                        onPressed: () => context.push(Routes.myListings),
                        child: const Text('My listings'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: SajhaSpacing.lg),
          Text(
            'Browsing is coming soon.',
            style: text.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
