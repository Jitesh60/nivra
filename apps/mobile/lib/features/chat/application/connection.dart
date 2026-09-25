import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/push/push_service.dart';
import '../../../core/realtime/realtime_client.dart';
import '../../../core/router/app_router.dart';
import '../../../core/router/routes.dart';
import '../../bookings/application/bookings_providers.dart';
import '../../discovery/application/discovery_providers.dart';
import '../data/chat_repository.dart';
import 'inbox.dart';

/// Keeps the live-updates socket open while signed in and in the foreground.
/// Coming back to the app refreshes the inbox and badge (events may have
/// been missed while away). Watched by the app root.
final realtimeConnectionProvider = Provider<void>((ref) {
  final client = ref.watch(realtimeClientProvider);
  var foreground = true;

  void apply() {
    if (ref.read(signedInProvider) && foreground) {
      client.connect();
    } else {
      client.disconnect();
    }
  }

  final lifecycle = AppLifecycleListener(
    onResume: () {
      foreground = true;
      apply();
      ref
        ..invalidate(unreadCountProvider)
        ..invalidate(inboxProvider)
        ..invalidate(unreadNotificationsProvider);
    },
    onPause: () {
      foreground = false;
      apply();
    },
  );
  ref.listen(signedInProvider, (_, _) => apply(), fireImmediately: true);
  ref.onDispose(() {
    lifecycle.dispose();
    client.disconnect();
  });
});

/// Registers this device for push once signed in (and again when the token
/// rotates), and opens what a tapped notification is about.
final pushRegistrationProvider = Provider<void>((ref) {
  final push = ref.watch(pushServiceProvider);

  Future<void> register([String? token]) async {
    if (!ref.read(signedInProvider)) return;
    try {
      final t = token ?? await push.register();
      if (t == null) return;
      await ref
          .read(chatRepositoryProvider)
          .registerPushToken(t, Platform.isIOS ? 'ios' : 'android');
    } catch (_) {
      // Push is best effort; chat still works through the socket and inbox.
    }
  }

  ref.listen(signedInProvider, (_, signedIn) {
    if (signedIn) unawaited(register());
  }, fireImmediately: true);
  final refreshes = push.tokenRefreshes.listen((t) => unawaited(register(t)));
  final opened = push.opened.listen((open) {
    if (!ref.read(signedInProvider)) return;
    final route = Routes.forNotification(
      type: open.type,
      bookingId: open.bookingId,
      conversationId: open.conversationId,
      listingId: open.listingId,
      requestId: open.requestId,
    );
    if (route != null) ref.read(routerProvider).push(route);
  });
  ref.onDispose(() {
    refreshes.cancel();
    opened.cancel();
  });
});
