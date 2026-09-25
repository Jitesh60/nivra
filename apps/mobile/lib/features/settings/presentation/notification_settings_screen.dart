import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/notification_preferences_controller.dart';
import '../data/notification_preferences.dart';

/// Push, email and SMS switches. The bell always shows everything.
class NotificationSettingsScreen extends ConsumerWidget {
  const NotificationSettingsScreen({super.key});

  static const _sections =
      <(String, List<(NotificationSwitch, String, String)>)>[
        (
          'Push notifications',
          [
            (
              NotificationSwitch.pushBookings,
              'Bookings',
              'Requests, payments, handover, returns, refunds and disputes',
            ),
            (NotificationSwitch.pushChat, 'Messages', 'New chat messages'),
            (
              NotificationSwitch.pushReminders,
              'Reminders',
              'Pickup tomorrow, return tomorrow, due today',
            ),
            (
              NotificationSwitch.pushSearchAlerts,
              'Saved search alerts',
              'New listings that match a search you saved',
            ),
            (
              NotificationSwitch.pushRequests,
              'Requests near you',
              'Someone nearby needs something you lend, and answers to your requests',
            ),
          ],
        ),
        (
          'Email',
          [
            (
              NotificationSwitch.emailBookings,
              'Receipts and updates',
              'Receipts, refunds and dispute decisions, to your verified email',
            ),
          ],
        ),
        (
          'SMS',
          [
            (
              NotificationSwitch.smsReminders,
              'Overdue returns',
              'A text if something you borrowed is late',
            ),
          ],
        ),
        (
          'From Sajha',
          [
            (
              NotificationSwitch.marketing,
              'News and offers',
              'New categories and offers near you, now and then',
            ),
          ],
        ),
      ];

  Future<void> _toggle(
    BuildContext context,
    WidgetRef ref,
    NotificationSwitch s,
    bool on,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(notificationPreferencesProvider.notifier).toggle(s, on);
    } on ApiException catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(notificationPreferencesProvider);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: switch (prefs) {
        AsyncData(:final value) => ListView(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                SajhaSpacing.lg,
                SajhaSpacing.md,
                SajhaSpacing.lg,
                0,
              ),
              child: Text(
                'Everything still shows in the bell, and sign-in codes '
                'always arrive.',
                style: text.bodySmall?.copyWith(color: muted),
              ),
            ),
            for (final (title, switches) in _sections) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  SajhaSpacing.lg,
                  SajhaSpacing.lg,
                  SajhaSpacing.lg,
                  SajhaSpacing.xs,
                ),
                child: Text(title, style: text.titleSmall),
              ),
              for (final (s, label, hint) in switches)
                SwitchListTile(
                  key: ValueKey('pref-${s.name}'),
                  title: Text(label),
                  subtitle: Text(hint),
                  value: value[s],
                  onChanged: (on) => _toggle(context, ref, s, on),
                ),
            ],
          ],
        ),
        AsyncError(:final error) => Center(
          child: Padding(
            padding: const EdgeInsets.all(SajhaSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException
                      ? error.friendlyMessage
                      : 'Couldn’t load your settings.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: SajhaSpacing.md),
                OutlinedButton(
                  onPressed: () =>
                      ref.invalidate(notificationPreferencesProvider),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}
