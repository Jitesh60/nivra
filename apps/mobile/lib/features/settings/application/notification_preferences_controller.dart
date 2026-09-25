import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/notification_preferences.dart';

/// The user's notification switches. A flip shows at once and is undone if
/// the API refuses it (the error is rethrown for the screen to show).
class NotificationPreferencesController
    extends AsyncNotifier<NotificationPreferences> {
  @override
  Future<NotificationPreferences> build() =>
      ref.read(notificationPreferencesRepositoryProvider).get();

  Future<void> toggle(NotificationSwitch s, bool on) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData(before.withValue(s, on));
    try {
      final saved = await ref
          .read(notificationPreferencesRepositoryProvider)
          .set(s, on);
      state = AsyncData(saved);
    } catch (_) {
      state = AsyncData(before);
      rethrow;
    }
  }
}

final notificationPreferencesProvider =
    AsyncNotifierProvider.autoDispose<
      NotificationPreferencesController,
      NotificationPreferences
    >(NotificationPreferencesController.new);
