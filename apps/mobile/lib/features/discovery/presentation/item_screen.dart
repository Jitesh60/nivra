import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/date_range_chooser.dart';
import '../../auth/application/auth_controller.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/data/models.dart' show ReportTarget;
import '../../chat/presentation/open_chat.dart';
import '../../bookings/presentation/request_booking.dart';
import '../../chat/presentation/report_sheet.dart';
import '../../listings/data/models.dart';
import '../../listings/presentation/listing_detail_view.dart';
import '../application/discovery_providers.dart';
import '../application/search_area.dart';
import '../data/discovery_repository.dart';
import '../data/models.dart';
import 'listing_card.dart';

ListingViewData viewDataFor(PublicListing l, {double? distanceKm}) =>
    ListingViewData(
      title: l.title,
      description: l.description,
      photos: [for (final p in l.photos) ViewPhoto.url(p.url)],
      pricePerDayPaise: l.pricePerDayPaise,
      weeklyDiscountPct: l.weeklyDiscountPct,
      depositPaise: l.depositPaise,
      minDays: l.minDays,
      maxDays: l.maxDays,
      advanceNoticeDays: l.advanceNoticeDays,
      requiredDocs: l.requiredDocs,
      blocks: l.blocks,
      category: l.category,
      condition: l.condition,
      brand: l.brand,
      size: l.size,
      areaLabel: l.areaLabel,
      distanceKm: distanceKm,
    );

/// A listing's public page: photos, details, the lender, the price for
/// chosen dates, Chat and "Request to book".
class ItemScreen extends ConsumerStatefulWidget {
  const ItemScreen({
    required this.id,
    this.saveOnOpen = false,
    this.chatOnOpen = false,
    this.bookOnOpen,
    super.key,
  });

  final String id;

  /// Set when a guest tapped save and just signed in: finish the save.
  final bool saveOnOpen;

  /// Set when a guest tapped Chat and just signed in: open the chat.
  final bool chatOnOpen;

  /// Set when a guest tapped "Request to book" for these dates and just
  /// signed in: pick up the request where they left off.
  final BlockedRange? bookOnOpen;

  @override
  ConsumerState<ItemScreen> createState() => _ItemScreenState();
}

class _ItemScreenState extends ConsumerState<ItemScreen> {
  BlockedRange? _dates;
  Quote? _quote;
  bool _quoting = false;
  String? _quoteError;
  bool _handledOpen = false;

  @override
  void initState() {
    super.initState();
    ref.listenManual(publicListingProvider(widget.id), (_, next) {
      final listing = next.value;
      // Not during initState's build: this updates other providers.
      if (listing != null) Future.microtask(() => _opened(listing));
    }, fireImmediately: true);
  }

  Future<void> _opened(PublicListing listing) async {
    if (_handledOpen || !mounted) return;
    _handledOpen = true;
    ref.read(recentlyViewedProvider.notifier).add(listing.id);
    if (!ref.read(signedInProvider) || _isMine(listing)) return;
    if (widget.chatOnOpen) {
      if (mounted) await openChat(context, ref, listing.id);
      return;
    }
    final book = widget.bookOnOpen;
    if (book != null) {
      await _setDates(listing, book);
      final q = _quote;
      if (mounted && q != null && q.available) {
        await requestBooking(
          context,
          ref,
          listing: listing,
          dates: book,
          quote: q,
        );
      }
      return;
    }
    if (!widget.saveOnOpen || listing.saved) return;
    try {
      await ref
          .read(savedListingsProvider.notifier)
          .toggle(listing.id, currentlySaved: false);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Saved to wishlist')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    }
  }

  Future<void> _reportListing(PublicListing listing) async {
    final draft = await showReportSheet(context, title: 'Report this listing');
    if (draft == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(chatRepositoryProvider)
          .report(
            target: ReportTarget.listing,
            targetId: listing.id,
            reason: draft.reason,
            note: draft.note,
          );
      messenger.showSnackBar(
        const SnackBar(content: Text('Thanks. Our team will take a look.')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    }
  }

  bool _isMine(PublicListing listing) {
    final auth = ref.read(authControllerProvider);
    return auth is Authenticated && auth.user.id == listing.lender.id;
  }

  Future<void> _chooseDates(PublicListing listing) async {
    final first = today();
    final earliest = first.add(Duration(days: listing.advanceNoticeDays));
    bool selectable(DateTime day) =>
        !day.isBefore(earliest) &&
        !listing.blocks.any(
          (b) => !day.isBefore(b.start) && !day.isAfter(b.end),
        );
    final range = await ref.read(dateRangeChooserProvider)(
      context,
      first: first,
      last: first.add(const Duration(days: 365)),
      initial: _dates == null
          ? null
          : DateTimeRange(start: _dates!.start, end: _dates!.end),
      selectable: selectable,
    );
    if (range == null || !mounted) return;
    await _setDates(listing, BlockedRange(range.start, range.end));
  }

  Future<void> _setDates(PublicListing listing, BlockedRange dates) async {
    setState(() {
      _dates = dates;
      _quoting = true;
      _quoteError = null;
    });
    try {
      final quote = await ref
          .read(discoveryRepositoryProvider)
          .quote(listing.id, dates);
      if (mounted) setState(() => _quote = quote);
    } on ApiException catch (e) {
      if (mounted) setState(() => _quoteError = e.friendlyMessage);
    } finally {
      if (mounted) setState(() => _quoting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final listing = ref.watch(publicListingProvider(widget.id));
    final area = ref.watch(searchAreaProvider).value;

    return switch (listing) {
      AsyncData(:final value) => _page(value, area),
      AsyncError(:final error) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(SajhaSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException
                      ? error.friendlyMessage
                      : 'Something went wrong.',
                  key: const ValueKey('item-error'),
                  textAlign: TextAlign.center,
                ),
                if (error is ApiException && error.isNetwork)
                  TextButton(
                    onPressed: () =>
                        ref.invalidate(publicListingProvider(widget.id)),
                    child: const Text('Try again'),
                  ),
              ],
            ),
          ),
        ),
      ),
      _ => Scaffold(
        appBar: AppBar(),
        body: const Center(child: CircularProgressIndicator()),
      ),
    };
  }

  Widget _page(PublicListing listing, SearchArea? area) {
    final mine = _isMine(listing);
    final distance = area == null
        ? null
        : roundDistanceKm(
            const Distance().as(
              LengthUnit.Meter,
              area.point,
              LatLng(listing.approxLat, listing.approxLng),
            ),
          );

    return Scaffold(
      appBar: AppBar(
        // Opened straight after sign-in, there's nothing to go back to.
        leading: context.canPop()
            ? null
            : IconButton(
                key: const ValueKey('item-home'),
                tooltip: 'Home',
                icon: const Icon(Icons.home_outlined),
                onPressed: () => context.go(Routes.home),
              ),
        actions: [
          if (!mine)
            SaveButton(listingId: listing.id, loadedSaved: listing.saved),
        ],
      ),
      body: ListingDetailView(
        data: viewDataFor(listing, distanceKm: distance),
        belowPrice: _dates == null
            ? null
            : _QuoteCard(
                dates: _dates!,
                quote: _quote,
                loading: _quoting,
                error: _quoteError,
              ),
        extras: [
          const Divider(height: SajhaSpacing.xl),
          _LenderTile(lender: listing.lender, mine: mine),
          if (listing.favoriteCount > 0)
            Padding(
              padding: const EdgeInsets.only(top: SajhaSpacing.sm),
              child: Text(
                '${listing.favoriteCount} '
                '${listing.favoriteCount == 1 ? 'person has' : 'people have'} '
                'saved this',
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          if (!mine && ref.watch(signedInProvider))
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                key: const ValueKey('report-listing'),
                onPressed: () => _reportListing(listing),
                icon: const Icon(Icons.flag_outlined, size: 18),
                label: const Text('Report this listing'),
              ),
            ),
          const SizedBox(height: SajhaSpacing.xl),
        ],
      ),
      bottomNavigationBar: mine
          ? null
          : _BottomBar(
              onChat: () => openChat(context, ref, listing.id),
              listing: listing,
              quote: _quote,
              hasDates: _dates != null,
              onChooseDates: () => _chooseDates(listing),
              onRequest: _dates != null && _quote != null && _quote!.available
                  ? () => requestBooking(
                      context,
                      ref,
                      listing: listing,
                      dates: _dates!,
                      quote: _quote!,
                    )
                  : null,
            ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.listing,
    required this.quote,
    required this.hasDates,
    required this.onChooseDates,
    required this.onChat,
    required this.onRequest,
  });

  final PublicListing listing;
  final Quote? quote;
  final bool hasDates;
  final VoidCallback onChooseDates;
  final VoidCallback onChat;

  /// Null until there are dates with an available quote.
  final VoidCallback? onRequest;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final q = quote;
    // The theme's buttons are full-width; these sit in a row.
    final rowButton = FilledButton.styleFrom(minimumSize: const Size(0, 48));

    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(SajhaSpacing.md),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          q != null && q.available
                              ? '${formatRupees(q.totalPaise)} total'
                              : '${formatRupees(listing.pricePerDayPaise)} / day',
                          key: const ValueKey('bar-price'),
                          style: text.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          q != null && q.available
                              ? 'Incl. refundable deposit'
                              : 'Pick dates to see the total',
                          style: text.bodySmall?.copyWith(color: muted),
                        ),
                      ],
                    ),
                  ),
                  if (!hasDates)
                    FilledButton(
                      key: const ValueKey('choose-dates'),
                      style: rowButton,
                      onPressed: onChooseDates,
                      child: const Text('Choose dates'),
                    )
                  else
                    OutlinedButton(
                      key: const ValueKey('choose-dates'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                      onPressed: onChooseDates,
                      child: const Text('Change dates'),
                    ),
                ],
              ),
              const SizedBox(height: SajhaSpacing.sm),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const ValueKey('chat-lender'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                      onPressed: onChat,
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: const Text('Chat'),
                    ),
                  ),
                  const SizedBox(width: SajhaSpacing.sm),
                  Expanded(
                    child: FilledButton(
                      key: const ValueKey('request-booking'),
                      style: rowButton,
                      onPressed: onRequest,
                      child: const Text('Request to book'),
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.only(top: SajhaSpacing.xs),
                child: Text(
                  hasDates
                      ? 'You won’t pay anything until the lender accepts.'
                      : 'Pick dates to request, or chat to agree a price.',
                  style: text.bodySmall?.copyWith(color: muted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuoteCard extends StatelessWidget {
  const _QuoteCard({
    required this.dates,
    required this.quote,
    required this.loading,
    required this.error,
  });

  final BlockedRange dates;
  final Quote? quote;
  final bool loading;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final q = quote;
    Widget line(String label, String value, {bool bold = false, Key? key}) =>
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              Expanded(child: Text(label)),
              Text(
                value,
                key: key,
                style: bold
                    ? const TextStyle(fontWeight: FontWeight.w700)
                    : null,
              ),
            ],
          ),
        );

    return Card(
      key: const ValueKey('quote-card'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(SajhaSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                formatRange(dates),
                if (q != null) '${q.days} ${q.days == 1 ? 'day' : 'days'}',
              ].join(' · '),
              style: text.titleSmall,
            ),
            const SizedBox(height: SajhaSpacing.sm),
            if (loading)
              const LinearProgressIndicator()
            else if (error != null)
              Text(error!, style: const TextStyle(color: SajhaColors.danger))
            else if (q != null && !q.available)
              Row(
                key: const ValueKey('quote-unavailable'),
                children: [
                  const Icon(Icons.event_busy, color: SajhaColors.danger),
                  const SizedBox(width: SajhaSpacing.sm),
                  Expanded(
                    child: Text(
                      q.unavailableReason?.message ??
                          'These dates don’t work for this item.',
                    ),
                  ),
                ],
              )
            else if (q != null) ...[
              line(
                '${formatRupees(q.pricePerDayPaise)} × ${q.days} '
                '${q.days == 1 ? 'day' : 'days'}',
                formatRupees(q.rentBeforeDiscountPaise),
              ),
              if (q.weeklyDiscountPaise > 0)
                line(
                  'Weekly discount',
                  '−${formatRupees(q.weeklyDiscountPaise)}',
                ),
              line(
                'Service fee',
                q.feePaise == 0 ? 'Free' : formatRupees(q.feePaise),
              ),
              line('Refundable deposit', formatRupees(q.depositPaise)),
              const Divider(),
              line(
                'Total',
                formatRupees(q.totalPaise),
                bold: true,
                key: const ValueKey('quote-total'),
              ),
              Text(
                'You get the deposit back when the item is returned as lent.',
                style: text.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LenderTile extends StatelessWidget {
  const _LenderTile({required this.lender, required this.mine});

  final LenderSummary lender;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final name = lender.name ?? 'Sajha lender';
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    final since = lender.memberSince;
    Widget badge(bool on, IconData icon, String label) => on
        ? Padding(
            padding: const EdgeInsets.only(right: SajhaSpacing.md),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 16, color: SajhaColors.brand600),
                const SizedBox(width: 2),
                Text(label, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          )
        : const SizedBox.shrink();

    return Column(
      key: const ValueKey('lender-card'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: CircleAvatar(
            backgroundColor: SajhaColors.brand100,
            foregroundColor: SajhaColors.brand800,
            foregroundImage: lender.avatarUrl == null
                ? null
                : NetworkImage(lender.avatarUrl!),
            onForegroundImageError: lender.avatarUrl == null ? null : (_, _) {},
            child: Text(initial),
          ),
          title: Text(mine ? '$name (you)' : name),
          subtitle: Text(
            [
              if (lender.city != null) lender.city!,
              'On Sajha since ${_monthYear(since)}',
            ].join(' · '),
          ),
        ),
        Wrap(
          children: [
            badge(lender.phoneVerified, Icons.phone_iphone, 'Phone'),
            badge(lender.emailVerified, Icons.alternate_email, 'Email'),
            badge(lender.idVerified, Icons.verified, 'ID verified'),
          ],
        ),
      ],
    );
  }
}

String _monthYear(DateTime d) => '${_months[d.month - 1]} ${d.year}';

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
