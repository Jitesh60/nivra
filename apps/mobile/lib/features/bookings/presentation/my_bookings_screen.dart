import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show formatRupees;
import '../application/bookings_providers.dart';
import '../data/models.dart';
import 'booking_format.dart';

/// Bookings you made (Borrowing) and of your items (Lending), each split
/// into in-progress and past.
class MyBookingsScreen extends StatelessWidget {
  const MyBookingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('My bookings'),
          bottom: const TabBar(
            tabs: [
              Tab(key: ValueKey('tab-borrowing'), text: 'Borrowing'),
              Tab(key: ValueKey('tab-lending'), text: 'Lending'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _RoleTab(BookingRole.borrower),
            _RoleTab(BookingRole.lender),
          ],
        ),
      ),
    );
  }
}

class _RoleTab extends StatefulWidget {
  const _RoleTab(this.role);

  final BookingRole role;

  @override
  State<_RoleTab> createState() => _RoleTabState();
}

class _RoleTabState extends State<_RoleTab> {
  BookingScope _scope = BookingScope.open;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(SajhaSpacing.md),
          child: SegmentedButton<BookingScope>(
            key: ValueKey('scope-${widget.role.name}'),
            segments: const [
              ButtonSegment(
                value: BookingScope.open,
                label: Text('In progress'),
              ),
              ButtonSegment(value: BookingScope.past, label: Text('Past')),
            ],
            selected: {_scope},
            onSelectionChanged: (s) => setState(() => _scope = s.first),
          ),
        ),
        Expanded(child: _BookingList((role: widget.role, scope: _scope))),
      ],
    );
  }
}

class _BookingList extends ConsumerWidget {
  const _BookingList(this.query);

  final BookingsQuery query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(bookingsProvider(query));
    return switch (list) {
      AsyncData(:final value) when value.items.isEmpty => Center(
        child: Padding(
          padding: const EdgeInsets.all(SajhaSpacing.xl),
          child: Text(
            query.role == BookingRole.borrower
                ? (query.scope == BookingScope.open
                      ? 'No bookings in progress. Find something to borrow and request it.'
                      : 'Nothing here yet.')
                : (query.scope == BookingScope.open
                      ? 'No requests for your items right now.'
                      : 'Nothing here yet.'),
            key: const ValueKey('bookings-empty'),
            textAlign: TextAlign.center,
          ),
        ),
      ),
      AsyncData(:final value) => RefreshIndicator(
        onRefresh: () => ref.refresh(bookingsProvider(query).future),
        child: NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.extentAfter < 300) {
              ref.read(bookingsProvider(query).notifier).loadMore();
            }
            return false;
          },
          child: ListView.separated(
            itemCount: value.items.length + (value.loadingMore ? 1 : 0),
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) => i == value.items.length
                ? const Padding(
                    padding: EdgeInsets.all(SajhaSpacing.md),
                    child: Center(child: CircularProgressIndicator()),
                  )
                : BookingTile(value.items[i]),
          ),
        ),
      ),
      AsyncError(:final error) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              error is ApiException
                  ? error.friendlyMessage
                  : 'Couldn’t load bookings.',
            ),
            TextButton(
              onPressed: () => ref.invalidate(bookingsProvider(query)),
              child: const Text('Try again'),
            ),
          ],
        ),
      ),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }
}

class BookingTile extends StatelessWidget {
  const BookingTile(this.booking, {super.key});

  final Booking booking;

  @override
  Widget build(BuildContext context) {
    final b = booking;
    final thumb = b.listing.thumbUrl;
    return ListTile(
      key: ValueKey('booking-${b.id}'),
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(SajhaRadius.sm),
        child: SizedBox.square(
          dimension: 48,
          child: thumb == null
              ? const ColoredBox(color: SajhaColors.brand100)
              : Image.network(
                  thumb,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) =>
                      const ColoredBox(color: SajhaColors.brand100),
                ),
        ),
      ),
      title: Text(
        b.listing.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${bookingDates(b)} · ${b.isBorrower ? 'from' : 'to'} ${b.other.firstName} · ${formatRupees(b.totalPaise)}',
          ),
          const SizedBox(height: 4),
          StatusChip(b.status),
        ],
      ),
      isThreeLine: true,
      onTap: () => context.push(Routes.booking(b.id)),
    );
  }
}
