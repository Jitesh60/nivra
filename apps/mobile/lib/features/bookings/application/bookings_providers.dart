import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/realtime_client.dart';
import '../../discovery/application/discovery_providers.dart';
import '../data/bookings_repository.dart';
import '../data/models.dart';

/// One booking's page. Reloads when the other person (or Sajha) changes it;
/// actions update it straight from the API's answer and throw `ApiException`
/// for the screen to show.
class BookingController extends AsyncNotifier<BookingDetail> {
  BookingController(this.bookingId);

  final String bookingId;

  BookingsRepository get _repo => ref.read(bookingsRepositoryProvider);

  @override
  Future<BookingDetail> build() async {
    final sub = ref
        .watch(realtimeClientProvider)
        .events
        .where(
          (e) =>
              e.name == RealtimeEvents.bookingUpdated &&
              e.data['id'] == bookingId,
        )
        .listen((_) => unawaited(refresh()));
    ref.onDispose(sub.cancel);
    return _repo.get(bookingId);
  }

  Future<void> refresh() async {
    try {
      final fresh = await _repo.get(bookingId);
      if (ref.mounted) state = AsyncData(fresh);
    } catch (_) {
      // Keep what's shown; the next event or pull-to-refresh tries again.
    }
  }

  Future<void> accept() => _apply(_repo.accept(bookingId));
  Future<void> decline(String? reason) =>
      _apply(_repo.decline(bookingId, reason: reason));
  Future<void> cancel(String reason) => _apply(_repo.cancel(bookingId, reason));
  Future<void> shareDocuments(Map<String, String> choices) =>
      _apply(_repo.shareDocuments(bookingId, choices));
  Future<void> approveDocuments() => _apply(_repo.approveDocuments(bookingId));
  Future<void> rejectDocuments(String reason) =>
      _apply(_repo.rejectDocuments(bookingId, reason));

  /// Shows the API's answer to an action taken on another screen.
  void replace(BookingDetail updated) {
    if (ref.mounted) state = AsyncData(updated);
    ref.invalidate(bookingsProvider);
  }

  Future<void> _apply(Future<BookingDetail> action) async {
    final updated = await action;
    if (ref.mounted) state = AsyncData(updated);
    ref.invalidate(bookingsProvider);
  }
}

final bookingProvider = AsyncNotifierProvider.autoDispose
    .family<BookingController, BookingDetail, String>(
      BookingController.new,
      retry: noRetry,
    );

class BookingsState {
  const BookingsState(this.items, this.cursor, {this.loadingMore = false});
  final List<Booking> items;
  final String? cursor;
  final bool loadingMore;
}

typedef BookingsQuery = ({BookingRole role, BookingScope scope});

/// "My bookings": one list per side and open/past, newest first. Reloads
/// when any booking changes.
class BookingsList extends AsyncNotifier<BookingsState> {
  BookingsList(this.query);

  final BookingsQuery query;

  @override
  Future<BookingsState> build() async {
    if (!ref.watch(signedInProvider)) return const BookingsState([], null);
    final sub = ref
        .watch(realtimeClientProvider)
        .events
        .where((e) => e.name == RealtimeEvents.bookingUpdated)
        .listen((_) => ref.invalidateSelf());
    ref.onDispose(sub.cancel);
    final page = await ref
        .read(bookingsRepositoryProvider)
        .list(query.role, query.scope);
    return BookingsState(page.items, page.nextCursor);
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.cursor == null || current.loadingMore) {
      return;
    }
    state = AsyncData(
      BookingsState(current.items, current.cursor, loadingMore: true),
    );
    try {
      final page = await ref
          .read(bookingsRepositoryProvider)
          .list(query.role, query.scope, cursor: current.cursor);
      state = AsyncData(
        BookingsState([...current.items, ...page.items], page.nextCursor),
      );
    } catch (_) {
      state = AsyncData(BookingsState(current.items, current.cursor));
    }
  }
}

final bookingsProvider = AsyncNotifierProvider.autoDispose
    .family<BookingsList, BookingsState, BookingsQuery>(
      BookingsList.new,
      retry: noRetry,
    );

/// Unread notifications, for the bell's badge. Live: a new one bumps it.
class UnreadNotifications extends AsyncNotifier<int> {
  @override
  Future<int> build() async {
    if (!ref.watch(signedInProvider)) return 0;
    final sub = ref
        .watch(realtimeClientProvider)
        .events
        .where((e) => e.name == RealtimeEvents.notificationNew)
        .listen((_) => ref.invalidateSelf());
    ref.onDispose(sub.cancel);
    return ref.read(bookingsRepositoryProvider).unreadNotifications();
  }
}

final unreadNotificationsProvider =
    AsyncNotifierProvider<UnreadNotifications, int>(
      UnreadNotifications.new,
      retry: noRetry,
    );

/// The bell's list, newest first. New ones arrive live.
class Notifications extends AsyncNotifier<NotificationPage> {
  @override
  Future<NotificationPage> build() async {
    final sub = ref
        .watch(realtimeClientProvider)
        .events
        .where((e) => e.name == RealtimeEvents.notificationNew)
        .listen((_) => ref.invalidateSelf());
    ref.onDispose(sub.cancel);
    return ref.read(bookingsRepositoryProvider).notifications();
  }

  Future<void> loadMore() async {
    final current = state.value;
    if (current == null || current.nextCursor == null) return;
    try {
      final page = await ref
          .read(bookingsRepositoryProvider)
          .notifications(cursor: current.nextCursor);
      state = AsyncData(
        NotificationPage(
          [...current.items, ...page.items],
          page.nextCursor,
          page.unread,
        ),
      );
    } catch (_) {}
  }

  /// Marks everything shown as read (opening the bell counts as reading it).
  Future<void> markAllRead() async {
    final current = state.value;
    if (current == null || current.unread == 0 || current.items.isEmpty) {
      return;
    }
    try {
      await ref
          .read(bookingsRepositoryProvider)
          .markNotificationsRead(upTo: current.items.first.id);
      ref.invalidate(unreadNotificationsProvider);
    } catch (_) {
      // Best effort; the badge catches up next time.
    }
  }
}

final notificationsProvider =
    AsyncNotifierProvider.autoDispose<Notifications, NotificationPage>(
      Notifications.new,
      retry: noRetry,
    );
