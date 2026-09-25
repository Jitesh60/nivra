import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../auth/data/auth_repository.dart';
import '../../auth/data/models.dart';
import 'settings_screen.dart';

final deviceSessionsProvider = FutureProvider.autoDispose<List<DeviceSession>>(
  (ref) => ref.watch(authRepositoryProvider).sessions(),
);

String timeAgo(DateTime time, {DateTime? now}) {
  final diff = (now ?? DateTime.now()).difference(time);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inHours < 1) return '${diff.inMinutes} min ago';
  if (diff.inDays < 1) return '${diff.inHours} h ago';
  if (diff.inDays < 30) return '${diff.inDays} d ago';
  return '${time.day}/${time.month}/${time.year}';
}

class DevicesScreen extends ConsumerWidget {
  const DevicesScreen({super.key});

  Future<void> _signOut(
    BuildContext context,
    WidgetRef ref,
    DeviceSession s,
  ) async {
    final ok = await confirm(
      context,
      title: 'Sign out this device?',
      body: '${s.deviceName ?? 'This device'} will need to sign in again.',
      action: 'Sign out',
    );
    if (!ok) return;
    try {
      await ref.read(authRepositoryProvider).revokeSession(s.id);
      ref.invalidate(deviceSessionsProvider);
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessions = ref.watch(deviceSessionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Your devices')),
      body: switch (sessions) {
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(deviceSessionsProvider.future),
          child: ListView(
            children: [
              for (final s in value)
                ListTile(
                  leading: Icon(
                    s.platform == 'ios'
                        ? LucideIcons.smartphone
                        : LucideIcons.smartphone,
                  ),
                  title: Text(s.deviceName ?? 'Unknown device'),
                  subtitle: Text(
                    s.current
                        ? 'This device'
                        : 'Last active ${timeAgo(s.lastUsedAt)}',
                  ),
                  trailing: s.current
                      ? null
                      : TextButton(
                          onPressed: () => _signOut(context, ref, s),
                          child: const Text('Sign out'),
                        ),
                ),
            ],
          ),
        ),
        AsyncError(:final error) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Something went wrong',
              ),
              TextButton(
                onPressed: () => ref.invalidate(deviceSessionsProvider),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}
