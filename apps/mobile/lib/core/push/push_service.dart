import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What a tapped notification points to.
class PushOpen {
  const PushOpen({this.conversationId});
  final String? conversationId;

  static PushOpen fromData(Map<String, dynamic> data) =>
      PushOpen(conversationId: data['conversationId'] as String?);
}

/// Push notifications. The default does nothing, so the app runs without
/// Firebase; `FirebasePushService` takes over when a build has Firebase
/// settings (see `AppConfig.firebase`). Faked in tests.
abstract interface class PushService {
  /// Asks for permission and returns this device's token, or null if push is
  /// off or refused.
  Future<String?> register();

  /// New tokens (they rotate); each must be sent to the API again.
  Stream<String> get tokenRefreshes;

  /// Notifications the user tapped, including the one that launched the app.
  Stream<PushOpen> get opened;
}

class NoopPushService implements PushService {
  @override
  Future<String?> register() async => null;

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();

  @override
  Stream<PushOpen> get opened => const Stream.empty();
}

/// Replaced in `main.dart` when Firebase is configured.
final pushServiceProvider = Provider<PushService>((ref) => NoopPushService());
