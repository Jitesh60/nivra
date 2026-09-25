import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../chat/presentation/chat_format.dart' show chatTime;
import '../application/bookings_providers.dart';
import '../data/models.dart';

/// The bell: bookings, requests and alerts, newest first. Opening it marks them read.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _marked = false;

  @override
  Widget build(BuildContext context) {
    final page = ref.watch(notificationsProvider);
    // Reading the list counts as reading them (once it has loaded).
    if (!_marked && page.hasValue) {
      _marked = true;
      Future.microtask(
        () => ref.read(notificationsProvider.notifier).markAllRead(),
      );
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: switch (page) {
        AsyncData(:final value) when value.items.isEmpty => const Center(
          child: Padding(
            padding: EdgeInsets.all(SajhaSpacing.xl),
            child: Text(
              'Nothing yet. Bookings, requests and alerts show up here.',
              key: ValueKey('notifications-empty'),
              textAlign: TextAlign.center,
            ),
          ),
        ),
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(notificationsProvider.future),
          child: ListView.separated(
            itemCount: value.items.length + (value.nextCursor == null ? 0 : 1),
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              if (i == value.items.length) {
                return TextButton(
                  onPressed: () =>
                      ref.read(notificationsProvider.notifier).loadMore(),
                  child: const Text('Show older'),
                );
              }
              return _Tile(value.items[i]);
            },
          ),
        ),
        AsyncError(:final error) => Center(
          child: Text(
            error is ApiException
                ? error.friendlyMessage
                : 'Couldn’t load notifications.',
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.n);

  final AppNotification n;

  @override
  Widget build(BuildContext context) {
    final bold = n.unread ? FontWeight.w700 : FontWeight.w400;
    final route = Routes.forNotification(
      type: n.type,
      bookingId: n.bookingId,
      listingId: n.listingId,
      requestId: n.requestId,
    );
    return ListTile(
      key: ValueKey('notification-${n.id}'),
      leading: Icon(switch (n.type) {
        final t when t.contains('docs') => LucideIcons.idCard,
        final t when t.startsWith('search.') => LucideIcons.bookmark,
        final t when t.startsWith('request.') => LucideIcons.megaphone,
        final t when t.startsWith('referral.') => LucideIcons.gift,
        _ => LucideIcons.calendarDays,
      }, color: n.unread ? SajhaColors.brand600 : null),
      title: Text(n.title, style: TextStyle(fontWeight: bold)),
      subtitle: Text(n.body),
      trailing: Text(chatTime(n.createdAt)),
      onTap: route == null ? null : () => context.push(route),
    );
  }
}
