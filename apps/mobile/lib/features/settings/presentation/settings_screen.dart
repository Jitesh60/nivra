import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/links/links.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../shared/widgets/user_avatar.dart';
import '../../auth/application/auth_controller.dart';

Future<bool> confirm(
  BuildContext context, {
  required String title,
  required String body,
  required String action,
  bool destructive = false,
}) async {
  final scheme = Theme.of(context).colorScheme;
  final ok = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(body),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel'),
        ),
        TextButton(
          style: destructive
              ? TextButton.styleFrom(foregroundColor: scheme.error)
              : null,
          onPressed: () => Navigator.pop(context, true),
          child: Text(action),
        ),
      ],
    ),
  );
  return ok ?? false;
}

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  Future<void> _run(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    try {
      await action();
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    if (auth is! Authenticated) return const SizedBox.shrink();
    final user = auth.user;
    final controller = ref.read(authControllerProvider.notifier);
    final error = Theme.of(context).colorScheme.error;

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            key: const ValueKey('settings-profile'),
            leading: UserAvatar(user: user, radius: 20),
            title: Text(user.name ?? '—'),
            subtitle: Text(user.phone),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.profile),
          ),
          ListTile(
            leading: const Icon(Icons.email_outlined),
            title: Text(user.email ?? 'No email yet'),
            subtitle: Text(user.emailVerified ? 'Verified' : 'Not verified'),
            onTap: user.emailVerified
                ? null
                : () => context.push(Routes.setupEmail),
          ),
          ListTile(
            key: const ValueKey('settings-documents'),
            leading: const Icon(Icons.badge_outlined),
            title: const Text('My documents'),
            subtitle: Text(user.idVerified ? 'ID verified' : 'No verified ID'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.documents),
          ),
          ListTile(
            key: const ValueKey('settings-notifications'),
            leading: const Icon(Icons.notifications_outlined),
            title: const Text('Notifications'),
            subtitle: const Text('Push, email and SMS'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.notificationSettings),
          ),
          ListTile(
            key: const ValueKey('settings-invite'),
            leading: const Icon(Icons.card_giftcard),
            title: const Text('Invite friends'),
            subtitle: const Text('Your code, and credit you’ve earned'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.invite),
          ),
          const Divider(),
          ListTile(
            key: const ValueKey('devices'),
            leading: const Icon(Icons.devices_outlined),
            title: const Text('Your devices'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(Routes.devices),
          ),
          ListTile(
            key: const ValueKey('logout'),
            leading: const Icon(Icons.logout),
            title: const Text('Log out'),
            onTap: () => _run(context, () => controller.logout()),
          ),
          ListTile(
            key: const ValueKey('logout-all'),
            leading: const Icon(Icons.phonelink_erase_outlined),
            title: const Text('Log out of all devices'),
            onTap: () async {
              final ok = await confirm(
                context,
                title: 'Log out everywhere?',
                body:
                    'You’ll be signed out on every phone, including this one.',
                action: 'Log out all',
              );
              if (ok && context.mounted) {
                await _run(context, () => controller.logout(everywhere: true));
              }
            },
          ),
          const Divider(),
          for (final (key, icon, label, uri) in [
            (
              'link-help',
              Icons.help_outline,
              'Help and contact',
              SajhaLinks.help,
            ),
            (
              'link-terms',
              Icons.description_outlined,
              'Terms of use',
              SajhaLinks.terms,
            ),
            (
              'link-privacy',
              Icons.privacy_tip_outlined,
              'Privacy policy',
              SajhaLinks.privacy,
            ),
          ])
            ListTile(
              key: ValueKey(key),
              leading: Icon(icon),
              title: Text(label),
              trailing: const Icon(Icons.open_in_new, size: 18),
              onTap: () => ref.read(linkOpenerProvider)(uri),
            ),
          const Divider(),
          ListTile(
            key: const ValueKey('delete-account'),
            leading: Icon(Icons.delete_forever_outlined, color: error),
            title: Text('Delete account', style: TextStyle(color: error)),
            onTap: () async {
              final ok = await confirm(
                context,
                title: 'Delete your account?',
                body: 'Your profile, photo, documents, phone number and email are removed and you’ll be signed out everywhere. This can’t be undone.',
                action: 'Delete',
                destructive: true,
              );
              if (ok && context.mounted) {
                await _run(context, controller.deleteAccount);
              }
            },
          ),
          ListTile(
            key: const ValueKey('link-delete-info'),
            dense: true,
            title: const Text('What deleting your account removes'),
            trailing: const Icon(Icons.open_in_new, size: 18),
            onTap: () => ref.read(linkOpenerProvider)(SajhaLinks.deleteAccount),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Sajha ${appVersion()}',
              key: const ValueKey('app-version'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }
}
