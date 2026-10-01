import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/effects/motion.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/user_avatar.dart';
import '../../auth/application/auth_controller.dart';

/// The Me tab: your profile, then one short list of everything that isn't
/// a tab of its own, then Log out.
class MeScreen extends ConsumerWidget {
  const MeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth is! Authenticated) return const SizedBox.shrink();
    final user = auth.user;
    final scheme = Theme.of(context).colorScheme;

    Future<void> logOut() async {
      try {
        await ref.read(authControllerProvider.notifier).logout();
      } on ApiException catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
        }
      }
    }

    final links = [
      _Link('open-wishlist', LucideIcons.heart, 'Wishlist', Routes.wishlist),
      _Link('open-earnings', LucideIcons.wallet, 'Earnings', Routes.earnings),
      _Link(
        'open-documents',
        LucideIcons.idCard,
        'My documents',
        Routes.documents,
      ),
      _Link(
        'open-my-requests',
        LucideIcons.megaphone,
        'My requests',
        Routes.myRequests,
      ),
      _Link(
        'open-saved-searches',
        LucideIcons.bookmark,
        'Saved searches',
        Routes.savedSearches,
      ),
      _Link('open-invite', LucideIcons.gift, 'Invite friends', Routes.invite),
      _Link('open-settings', LucideIcons.settings, 'Settings', Routes.settings),
    ];

    final items = <Widget>[
      ListTile(
        key: const ValueKey('open-profile'),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: SajhaSpacing.lg,
          vertical: SajhaSpacing.sm,
        ),
        leading: UserAvatar(user: user, radius: 26),
        title: Text(
          user.name ?? 'Your profile',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        subtitle: const Text('View and edit profile'),
        trailing: const Icon(LucideIcons.chevronRight),
        onTap: () => context.push(Routes.profile),
      ),
      const Divider(),
      for (final link in links)
        ListTile(
          key: ValueKey(link.key),
          leading: Icon(link.icon, color: scheme.onSurfaceVariant),
          title: Text(link.label),
          trailing: const Icon(LucideIcons.chevronRight),
          onTap: () => context.push(link.route),
        ),
      const Divider(),
      ListTile(
        key: const ValueKey('me-logout'),
        leading: Icon(LucideIcons.logOut, color: scheme.error),
        title: Text('Log out', style: TextStyle(color: scheme.error)),
        onTap: logOut,
      ),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Me')),
      body: ListView(
        padding: const EdgeInsets.only(bottom: SajhaSpacing.xl),
        children: staggered(context, items),
      ),
    );
  }
}

class _Link {
  const _Link(this.key, this.icon, this.label, this.route);
  final String key;
  final IconData icon;
  final String label;
  final String route;
}
