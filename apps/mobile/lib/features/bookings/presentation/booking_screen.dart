import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../chat/presentation/chat_format.dart' show ParticipantAvatar;
import '../../listings/data/models.dart' show formatRupees;
import '../../../core/media/photo_picker.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/data/models.dart' show ReportTarget;
import '../../chat/presentation/report_sheet.dart';
import '../../payments/presentation/pay_flow.dart';
import '../../rentals/data/rentals_repository.dart';
import '../../rentals/presentation/rental_sections.dart';
import '../application/bookings_providers.dart';
import '../data/bookings_repository.dart';
import '../data/models.dart';
import 'booking_format.dart';
import 'reason_dialog.dart';
import 'shared_document_screen.dart';

/// One booking: where it is, what happens next, the money, documents and the
/// timeline. Buttons come from the API's `can` flags.
class BookingScreen extends ConsumerStatefulWidget {
  const BookingScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  ConsumerState<BookingScreen> createState() => _BookingScreenState();
}

class _BookingScreenState extends ConsumerState<BookingScreen> {
  bool _busy = false;

  BookingController get _controller =>
      ref.read(bookingProvider(widget.bookingId).notifier);

  Future<void> _run(Future<void> Function() action, String done) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      messenger.showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      await _controller.refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decline() async {
    final reason = await askReason(
      context,
      title: 'Decline this request?',
      message: 'The borrower will be told. A short reason helps them.',
      confirmLabel: 'Decline',
      required: false,
    );
    if (reason == null || !mounted) return;
    await _run(() => _controller.decline(reason), 'Request declined');
  }

  Future<void> _cancel(BookingDetail d) async {
    final b = d.booking;
    var message = b.isBorrower
        ? 'Nothing has been paid, so there’s nothing to refund.'
        : 'Cancelling after accepting counts against you as a lender.';
    if (d.payment?.status.paid ?? false) {
      // What comes back depends on how close pickup is: ask the API.
      setState(() => _busy = true);
      try {
        final preview = await ref
            .read(bookingsRepositoryProvider)
            .cancelPreview(b.id);
        message = preview.summary;
      } on ApiException catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
        }
        return;
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      if (!mounted) return;
    }
    final reason = await askReason(
      context,
      title: 'Cancel this booking?',
      message: message,
      confirmLabel: 'Cancel booking',
    );
    if (reason == null || !mounted) return;
    await _run(
      () => _controller.cancel(reason),
      d.payment?.status.paid ?? false
          ? 'Booking cancelled. Any refund is on its way.'
          : 'Booking cancelled',
    );
  }

  Future<void> _pay() async {
    setState(() => _busy = true);
    try {
      await payForBooking(context, ref, widget.bookingId);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    await _controller.refresh();
  }

  Future<void> _rejectDocuments() async {
    final reason = await askReason(
      context,
      title: 'Not accept these documents?',
      message: 'The booking will be declined, and the borrower will see why.',
      confirmLabel: 'Decline booking',
    );
    if (reason == null || !mounted) return;
    await _run(() => _controller.rejectDocuments(reason), 'Booking declined');
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(bookingProvider(widget.bookingId));
    return Scaffold(
      appBar: AppBar(
        title: Text(switch (detail) {
          AsyncData(:final value) => 'Booking ${value.booking.ref}',
          _ => 'Booking',
        }),
      ),
      body: switch (detail) {
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: _controller.refresh,
          child: _body(value),
        ),
        AsyncError(:final error) => Center(
          child: Padding(
            padding: const EdgeInsets.all(SajhaSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException
                      ? error.friendlyMessage
                      : 'Couldn’t load this booking.',
                  key: const ValueKey('booking-error'),
                  textAlign: TextAlign.center,
                ),
                TextButton(
                  onPressed: () =>
                      ref.invalidate(bookingProvider(widget.bookingId)),
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

  Widget _body(BookingDetail d) {
    final b = d.booking;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final can = d.can;
    final submitted = d.sharedDocuments.any(
      (s) => s.status == ShareStatus.submitted,
    );

    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        // The item and the other person.
        Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(SajhaRadius.md),
              child: SizedBox.square(
                dimension: 64,
                child: b.listing.thumbUrl == null
                    ? const ColoredBox(color: SajhaColors.brand100)
                    : Image.network(
                        b.listing.thumbUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            const ColoredBox(color: SajhaColors.brand100),
                      ),
              ),
            ),
            const SizedBox(width: SajhaSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(b.listing.title, style: text.titleMedium),
                  Text(
                    '${bookingDates(b)} · ${dayCount(b.days)}',
                    key: const ValueKey('booking-dates'),
                  ),
                  const SizedBox(height: 4),
                  StatusChip(b.status, key: const ValueKey('booking-status')),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: SajhaSpacing.md),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: ParticipantAvatar(person: b.other),
          title: Text(b.other.displayName),
          subtitle: Text(b.isBorrower ? 'Lender' : 'Borrower'),
          trailing: OutlinedButton.icon(
            key: const ValueKey('booking-chat'),
            style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40)),
            onPressed: () => context.push(Routes.chat(b.conversationId)),
            icon: const Icon(LucideIcons.messageCircle, size: 18),
            label: const Text('Chat'),
          ),
        ),

        // What happens next.
        Card(
          margin: const EdgeInsets.symmetric(vertical: SajhaSpacing.sm),
          child: Padding(
            padding: const EdgeInsets.all(SajhaSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(nextStep(d), key: const ValueKey('booking-next-step')),
                if (b.expiresAt != null && b.status.open) ...[
                  const SizedBox(height: SajhaSpacing.xs),
                  Countdown(
                    until: b.expiresAt!,
                    prefix: switch (b.status) {
                      BookingStatus.awaitingPayment => 'Dates held for',
                      BookingStatus.returned =>
                        b.isBorrower
                            ? 'Deposit settles in'
                            : 'Time left to report a problem:',
                      _ => 'Expires in',
                    },
                  ),
                ],
              ],
            ),
          ),
        ),

        if (LateBanner.shows(d)) LateBanner(d),
        if (d.pickupAddress != null)
          Card(
            key: const ValueKey('booking-pickup'),
            margin: const EdgeInsets.only(bottom: SajhaSpacing.sm),
            child: ListTile(
              leading: const Icon(LucideIcons.mapPin),
              title: const Text('Pickup address'),
              subtitle: SelectableText(d.pickupAddress!),
            ),
          ),

        // Actions.
        if (can.showCode)
          FilledButton.icon(
            key: const ValueKey('booking-show-code'),
            onPressed: () => context.push(Routes.bookingCode(b.id)),
            icon: const Icon(LucideIcons.qrCode),
            label: Text(
              b.isBorrower ? 'Show handover code' : 'Show return code',
            ),
          ),
        if (can.handover)
          FilledButton.icon(
            key: const ValueKey('booking-handover'),
            onPressed: _busy
                ? null
                : () => context.push(Routes.bookingHandover(b.id)),
            icon: const Icon(LucideIcons.scanQrCode),
            label: const Text('Hand over'),
          ),
        if (can.returnItem)
          FilledButton.icon(
            key: const ValueKey('booking-return'),
            onPressed: _busy
                ? null
                : () => context.push(Routes.bookingReturn(b.id)),
            icon: const Icon(LucideIcons.scanQrCode),
            label: const Text('Return it'),
          ),
        if (can.respond)
          FilledButton(
            key: const ValueKey('booking-respond'),
            onPressed: () => context.push(Routes.bookingRespond(b.id)),
            child: const Text('Give your side'),
          ),
        if (can.review)
          FilledButton.icon(
            key: const ValueKey('booking-review'),
            onPressed: () => context.push(Routes.bookingReview(b.id)),
            icon: const Icon(LucideIcons.star),
            label: Text('Rate ${b.other.firstName}'),
          ),
        if (can.addPhotos)
          OutlinedButton.icon(
            key: const ValueKey('booking-add-photos'),
            onPressed: _busy ? null : () => _addPhotos(b),
            icon: const Icon(LucideIcons.imagePlus),
            label: const Text('Add condition photos'),
          ),
        if (can.dispute)
          OutlinedButton(
            key: const ValueKey('booking-dispute'),
            onPressed: () => context.push(Routes.bookingDispute(b.id)),
            child: const Text('Report a problem'),
          ),
        if (can.noShow)
          TextButton(
            key: const ValueKey('booking-no-show'),
            onPressed: _busy ? null : _noShow,
            child: const Text('Borrower didn’t show up'),
          ),
        if (can.pay)
          FilledButton.icon(
            key: const ValueKey('booking-pay'),
            onPressed: _busy ? null : _pay,
            icon: const Icon(LucideIcons.lock),
            label: Text('Pay ${formatRupees(b.totalPaise)}'),
          ),
        if (can.accept)
          FilledButton(
            key: const ValueKey('booking-accept'),
            onPressed: _busy
                ? null
                : () => _run(_controller.accept, 'Request accepted'),
            child: const Text('Accept request'),
          ),
        if (can.decline)
          TextButton(
            key: const ValueKey('booking-decline'),
            onPressed: _busy ? null : _decline,
            child: const Text('Decline'),
          ),
        if (can.shareDocs)
          FilledButton.icon(
            key: const ValueKey('booking-share'),
            onPressed: _busy
                ? null
                : () => context.push(Routes.bookingShare(b.id)),
            icon: const Icon(LucideIcons.idCard),
            label: const Text('Share documents'),
          ),
        if (can.reviewDocs) ...[
          FilledButton(
            key: const ValueKey('docs-approve'),
            onPressed: _busy
                ? null
                : () =>
                      _run(_controller.approveDocuments, 'Documents approved'),
            child: const Text('Approve documents'),
          ),
          TextButton(
            key: const ValueKey('docs-reject'),
            onPressed: _busy ? null : _rejectDocuments,
            child: const Text('Don’t accept'),
          ),
        ],

        // Money.
        const Divider(height: SajhaSpacing.xl),
        Text('Price', style: text.titleSmall),
        const SizedBox(height: SajhaSpacing.xs),
        _line(
          '${formatRupees(b.pricePerDayPaise)} × ${dayCount(b.days)}',
          formatRupees(b.rentPaise),
        ),
        if (b.feePaise > 0) _line('Service fee', formatRupees(b.feePaise)),
        _line('Refundable deposit', formatRupees(b.depositPaise)),
        _line('Total', formatRupees(b.totalPaise), bold: true),
        if (b.fromOffer)
          Text(
            'Price agreed in chat.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
        if (d.payment case final p? when p.status.paid) ...[
          const SizedBox(height: SajhaSpacing.sm),
          _line(
            [
              b.isBorrower ? 'Paid' : 'Borrower paid',
              if (p.paidAt != null) whenText(p.paidAt!),
              ?p.method,
            ].join(' · '),
            formatRupees(p.amountPaise),
            key: 'booking-paid',
          ),
          for (final (i, r) in p.refunds.indexed)
            _line(
              '${refundText(r)} · ${r.status.label}',
              '− ${formatRupees(r.amountPaise)}',
              key: 'booking-refund-$i',
            ),
          if (d.rental case final r?
              when r.returnedAt != null && r.lateFeePaise > 0)
            _line(
              'Late fee (${r.lateDays} ${r.lateDays == 1 ? 'day' : 'days'}, from the deposit)',
              formatRupees(r.lateFeePaise),
              key: 'booking-late-fee',
            ),
          if (!b.isBorrower && b.status != BookingStatus.completed)
            Text(
              'Your share (rent less Nivra’s 10% commission) is held until '
              'the item is back. See Earnings in your profile.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
        ],
        if (d.conditionReports.isNotEmpty) ConditionPhotosSection(d),
        if (d.dispute != null) DisputeSection(d),
        if (ReviewsSection.shows(d)) ReviewsSection(d),

        // Documents.
        if (d.requiredDocs.isNotEmpty) ...[
          const Divider(height: SajhaSpacing.xl),
          Text('Documents', style: text.titleSmall),
          const SizedBox(height: SajhaSpacing.xs),
          if (d.sharedDocuments.isEmpty)
            for (final r in d.requiredDocs)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(LucideIcons.idCard),
                title: Text(r.title),
                subtitle: const Text('Not shared yet'),
              )
          else
            for (final s in d.sharedDocuments) _sharedTile(b, s),
          if (b.isBorrower && d.sharedDocuments.isNotEmpty)
            Text(
              'Shared only with ${b.other.firstName} for this booking. '
              'Access ends when the booking closes.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
          if (!b.isBorrower && submitted)
            Text(
              'Open each document before you decide. Screenshots are blocked '
              'and every view is shown to the borrower.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
        ],

        // Timeline.
        const Divider(height: SajhaSpacing.xl),
        Text('Timeline', style: text.titleSmall),
        for (final (i, e) in d.events.indexed)
          ListTile(
            key: ValueKey('booking-event-$i'),
            contentPadding: EdgeInsets.zero,
            dense: true,
            leading: const Icon(LucideIcons.circle, size: 10),
            title: Text(eventText(e, b)),
            subtitle: Text(
              [
                whenText(e.at),
                if (e.note != null && e.note != 'Offer agreed in chat')
                  '“${e.note}”',
              ].join(' · '),
            ),
          ),

        if (can.cancel) ...[
          const SizedBox(height: SajhaSpacing.lg),
          OutlinedButton(
            key: const ValueKey('booking-cancel'),
            style: OutlinedButton.styleFrom(
              foregroundColor: SajhaColors.danger,
            ),
            onPressed: _busy ? null : () => _cancel(d),
            child: const Text('Cancel booking'),
          ),
        ],
        if (b.status != BookingStatus.requested)
          TextButton(
            key: const ValueKey('booking-report'),
            onPressed: () => _report(b),
            child: Text('Report ${b.other.firstName}'),
          ),
      ],
    );
  }

  Future<void> _noShow() async {
    final note = await askReason(
      context,
      title: 'Borrower didn’t show up?',
      message:
          'The booking is cancelled. The borrower gets their deposit back, '
          'and your share of the rent is paid to you.',
      confirmLabel: 'Cancel: didn’t show',
      required: false,
    );
    if (note == null || !mounted) return;
    await _run(() async {
      final updated = await ref
          .read(rentalsRepositoryProvider)
          .noShow(widget.bookingId, note: note);
      _controller.replace(updated);
    }, 'Booking cancelled');
  }

  /// More condition photos: handover ones while it's out, return ones after.
  Future<void> _addPhotos(Booking b) async {
    final stage = b.status == BookingStatus.active
        ? RentalStage.handover
        : RentalStage.returned;
    final photos = await ref.read(photoPickerProvider).pickMany(limit: 6);
    if (photos.isEmpty || !mounted) return;
    await _run(() async {
      final updated = await ref
          .read(rentalsRepositoryProvider)
          .addPhotos(widget.bookingId, stage, photos);
      _controller.replace(updated);
    }, 'Photos added');
  }

  Future<void> _report(Booking b) async {
    final draft = await showReportSheet(
      context,
      title: 'Report ${b.other.firstName}',
    );
    if (draft == null || !mounted) return;
    await _run(
      () => ref
          .read(chatRepositoryProvider)
          .report(
            target: ReportTarget.user,
            targetId: b.other.id,
            reason: draft.reason,
            note: draft.note,
            conversationId: b.conversationId,
          ),
      'Thanks. Nivra will look into it.',
    );
  }

  Widget _sharedTile(Booking b, SharedDocument s) {
    final status = switch (s.status) {
      ShareStatus.submitted => 'Waiting for review',
      ShareStatus.approved => 'Approved',
      ShareStatus.rejected => 'Not accepted',
    };
    final views = s.views.isEmpty
        ? (b.isBorrower ? 'Not opened yet' : null)
        : 'Opened ${s.views.length} ${s.views.length == 1 ? 'time' : 'times'}, '
              'last ${whenText(s.views.last.at)}';
    return ListTile(
      key: ValueKey('shared-${s.id}'),
      contentPadding: EdgeInsets.zero,
      leading: Icon(s.verified ? LucideIcons.shieldCheck : LucideIcons.idCard),
      title: Text(s.title),
      subtitle: Text(
        [status, if (s.verified) 'Verified by Nivra', ?views].join(' · '),
      ),
      trailing: s.viewable ? const Icon(LucideIcons.chevronRight) : null,
      onTap: s.viewable
          ? () => context.push(
              Routes.bookingDocument,
              extra: SharedDocumentArgs(
                bookingId: b.id,
                shareId: s.id,
                title: s.title,
                hasBack: s.hasBack,
              ),
            )
          : null,
    );
  }

  Widget _line(String label, String value, {bool bold = false, String? key}) =>
      Padding(
        key: key == null ? null : ValueKey(key),
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
}
