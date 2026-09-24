import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/realtime_client.dart';
import '../../discovery/application/discovery_providers.dart';
import '../data/chat_repository.dart';
import '../data/models.dart';

/// Conversations with unread messages, for the inbox badge. Refreshes when a
/// message arrives or is read.
class UnreadCount extends AsyncNotifier<int> {
  @override
  Future<int> build() async {
    if (!ref.watch(signedInProvider)) return 0;
    final sub = ref
        .watch(realtimeClientProvider)
        .events
        .where(
          (e) =>
              (e.name == RealtimeEvents.messageNew && e.data['mine'] != true) ||
              e.name == RealtimeEvents.messageRead,
        )
        .listen((_) => ref.invalidateSelf());
    ref.onDispose(sub.cancel);
    return ref.read(chatRepositoryProvider).unreadConversations();
  }
}

final unreadCountProvider = AsyncNotifierProvider<UnreadCount, int>(
  UnreadCount.new,
  retry: noRetry,
);

class InboxState {
  const InboxState(this.items, this.cursor, {this.loadingMore = false});
  final List<Conversation> items;
  final String? cursor;
  final bool loadingMore;
}

/// The inbox, newest first; reloads when messages or offers change.
class Inbox extends AsyncNotifier<InboxState> {
  @override
  Future<InboxState> build() async {
    if (!ref.watch(signedInProvider)) return const InboxState([], null);
    final sub = ref
        .watch(realtimeClientProvider)
        .events
        .where(
          (e) =>
              e.name == RealtimeEvents.messageNew ||
              e.name == RealtimeEvents.messageRead,
        )
        .listen((_) => ref.invalidateSelf());
    ref.onDispose(sub.cancel);
    final page = await ref.read(chatRepositoryProvider).inbox();
    return InboxState(page.items, page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.cursor == null || current.loadingMore) {
      return;
    }
    state = AsyncData(
      InboxState(current.items, current.cursor, loadingMore: true),
    );
    try {
      final page = await ref
          .read(chatRepositoryProvider)
          .inbox(cursor: current.cursor);
      state = AsyncData(
        InboxState([...current.items, ...page.items], page.nextCursor),
      );
    } catch (_) {
      state = AsyncData(InboxState(current.items, current.cursor));
    }
  }
}

final inboxProvider = AsyncNotifierProvider<Inbox, InboxState>(
  Inbox.new,
  retry: noRetry,
);
