import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/router/sign_in_return.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/verify_email_dialog.dart';
import '../../auth/application/auth_controller.dart';
import '../../discovery/data/models.dart' show PublicListing, Quote;
import '../../listings/data/models.dart'
    show BlockedRange, formatRupees, isoDate;
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../data/bookings_repository.dart';
import 'booking_format.dart' show dayCount;

const _whyVerify =
    'To keep bookings safe, everyone booking on Sajha has a verified phone and email.';

/// Dates carried through sign-in by `/item/:id?book=1&from=…&to=…`.
BlockedRange? bookDates(Map<String, String> query) {
  if (query['book'] != '1') return null;
  final from = DateTime.tryParse(query['from'] ?? '');
  final to = DateTime.tryParse(query['to'] ?? '');
  return from == null || to == null || to.isBefore(from)
      ? null
      : BlockedRange(from, to);
}

/// "Request to book": guests sign in first (and come back with the dates),
/// people without a verified email are asked to verify it, everyone else
/// confirms the price and sends the request, then lands on the booking.
Future<void> requestBooking(
  BuildContext context,
  WidgetRef ref, {
  required PublicListing listing,
  required BlockedRange dates,
  required Quote quote,
}) async {
  final auth = ref.read(authControllerProvider);
  if (auth is! Authenticated) {
    requireSignIn(
      context,
      ref,
      Routes.item(
        listing.id,
        book: (from: isoDate(dates.start), to: isoDate(dates.end)),
      ),
    );
    return;
  }
  if (!auth.user.emailVerified) {
    await askToVerifyEmail(context, why: _whyVerify);
    return;
  }
  final confirmed = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _ConfirmSheet(listing: listing, dates: dates, quote: quote),
  );
  if (confirmed != true || !context.mounted) return;

  final messenger = ScaffoldMessenger.of(context);
  final router = GoRouter.of(context);
  try {
    final booking = await ref
        .read(bookingsRepositoryProvider)
        .request(listingId: listing.id, start: dates.start, end: dates.end);
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          'Request sent. ${listing.lender.firstName} has a day to reply.',
        ),
      ),
    );
    router.push(Routes.booking(booking.booking.id));
  } on ApiException catch (e) {
    if (e.code == 'VERIFICATION_REQUIRED' && context.mounted) {
      await askToVerifyEmail(context, why: _whyVerify);
    } else {
      messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    }
  }
}

class _ConfirmSheet extends StatelessWidget {
  const _ConfirmSheet({
    required this.listing,
    required this.dates,
    required this.quote,
  });

  final PublicListing listing;
  final BlockedRange dates;
  final Quote quote;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final q = quote;
    Widget line(String label, String value, {bool bold = false}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Expanded(child: Text(label)),
          Text(
            value,
            style: bold ? const TextStyle(fontWeight: FontWeight.w700) : null,
          ),
        ],
      ),
    );

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          SajhaSpacing.lg,
          0,
          SajhaSpacing.lg,
          SajhaSpacing.lg,
        ),
        child: Column(
          key: const ValueKey('request-sheet'),
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Request to book', style: text.titleLarge),
            const SizedBox(height: SajhaSpacing.xs),
            Text(
              '${listing.title} · ${formatRange(dates)} · ${dayCount(q.days)}',
            ),
            const SizedBox(height: SajhaSpacing.md),
            line(
              '${formatRupees(q.pricePerDayPaise)} × ${dayCount(q.days)}',
              formatRupees(q.rentBeforeDiscountPaise),
            ),
            if (q.weeklyDiscountPaise > 0)
              line(
                'Weekly discount',
                '− ${formatRupees(q.weeklyDiscountPaise)}',
              ),
            if (q.feePaise > 0) line('Service fee', formatRupees(q.feePaise)),
            line('Refundable deposit', formatRupees(q.depositPaise)),
            if (q.creditPaise > 0)
              line('Invite credit', '− ${formatRupees(q.creditPaise)}'),
            const Divider(),
            line('Total', formatRupees(q.totalPaise), bold: true),
            if (listing.requiredDocs.isNotEmpty) ...[
              const SizedBox(height: SajhaSpacing.md),
              Text(
                '${listing.lender.firstName} will ask for',
                style: text.titleSmall,
              ),
              for (final d in listing.requiredDocs)
                Text('• ${d.title}', key: const ValueKey('request-doc')),
              Text(
                'You’ll share them from your documents after they accept.',
                style: text.bodySmall?.copyWith(color: muted),
              ),
            ],
            const SizedBox(height: SajhaSpacing.md),
            Text(
              '${listing.lender.firstName} has 24 hours to reply. You won’t '
              'pay anything until they accept.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
            const SizedBox(height: SajhaSpacing.md),
            FilledButton(
              key: const ValueKey('confirm-request'),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Send request'),
            ),
          ],
        ),
      ),
    );
  }
}
