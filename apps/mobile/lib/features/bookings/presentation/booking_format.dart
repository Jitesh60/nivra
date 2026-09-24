import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show BlockedRange, formatRupees;
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../data/models.dart';

String bookingDates(Booking b) =>
    formatRange(BlockedRange(b.startDate, b.endDate));

String dayCount(int days) => '$days ${days == 1 ? 'day' : 'days'}';

/// "5h 12m", "38m", "under a minute".
String timeLeft(Duration d) {
  if (d.inMinutes < 1) return 'under a minute';
  final h = d.inHours;
  final m = d.inMinutes % 60;
  if (h >= 24) return '${d.inDays}d ${h % 24}h';
  return h == 0 ? '${m}m' : '${h}h ${m}m';
}

/// "12 Oct, 14:05" in local time.
String whenText(DateTime at) {
  final l = at.toLocal();
  final day = formatRange(BlockedRange(l, l));
  return '$day, ${l.hour.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')}';
}

Color statusColor(BookingStatus s) => switch (s) {
  BookingStatus.requested || BookingStatus.awaitingDocs => SajhaColors.warning,
  BookingStatus.awaitingPayment ||
  BookingStatus.confirmed ||
  BookingStatus.active => SajhaColors.brand600,
  BookingStatus.completed || BookingStatus.returned => SajhaColors.success,
  _ => SajhaColors.danger,
};

class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});

  final BookingStatus status;

  @override
  Widget build(BuildContext context) {
    final color = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(SajhaRadius.full),
      ),
      child: Text(
        status.label,
        style: TextStyle(
          color: color,
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}

/// What happens next, from the viewer's side.
String nextStep(BookingDetail d) {
  final b = d.booking;
  final other = b.other.firstName;
  final submitted = d.sharedDocuments.any(
    (s) => s.status == ShareStatus.submitted,
  );
  switch (b.status) {
    case BookingStatus.requested:
      return b.isBorrower
          ? 'Waiting for $other to reply. You won’t pay anything yet.'
          : '$other wants to borrow this. Accept or decline before the request expires.';
    case BookingStatus.awaitingDocs:
      if (b.isBorrower) {
        return submitted
            ? 'Waiting for $other to review your documents.'
            : '$other asks for documents before lending. Share them from your vault.';
      }
      return submitted
          ? '$other shared their documents. Review them to continue.'
          : 'Waiting for $other to share the documents you asked for.';
    case BookingStatus.awaitingPayment:
      return b.isBorrower
          ? 'Accepted! Pay to confirm. Your dates are held until the timer runs out.'
          : 'Accepted. The dates are held while $other pays.';
    case BookingStatus.confirmed when d.can.handover:
      return 'Pickup day! Scan $other’s code, then photograph the item before handing it over.';
    case BookingStatus.confirmed:
      return b.isBorrower
          ? 'Confirmed! Pick it up from $other on ${formatRange(BlockedRange(b.startDate, b.startDate))}; the address is below. Show your handover code at pickup.'
          : 'Confirmed and paid. $other picks it up on ${formatRange(BlockedRange(b.startDate, b.startDate))}.';
    case BookingStatus.declined:
      return b.declineReason == null
          ? 'This request was declined.'
          : 'Declined: “${b.declineReason}”';
    case BookingStatus.expired:
      return 'This booking expired before the next step was done.';
    case BookingStatus.cancelled when d.rental?.noShowAt != null:
      return b.isBorrower
          ? '$other says you didn’t come for the pickup, so the booking was cancelled. Your deposit comes back; the rent doesn’t.'
          : 'Cancelled: the borrower didn’t come. Your share of the rent is paid to you.';
    case BookingStatus.active:
      final due = whenText(
        d.rental!.dueAt.subtract(const Duration(minutes: 1)),
      );
      return b.isBorrower
          ? 'Enjoy! Return it by $due. At the return, scan $other’s code and photograph the item.'
          : '$other has it until $due. At the return, show them your return code.';
    case BookingStatus.returned:
      final until = d.rental?.claimUntil;
      return b.isBorrower
          ? 'Returned. Your deposit comes back once $other has checked the item${until == null ? '' : ' (by ${whenText(until)})'}.'
          : 'Returned. Check the item now: you can report a problem${until == null ? '' : ' until ${whenText(until)}'}.';
    case BookingStatus.disputed:
      final dispute = d.dispute;
      if (b.isBorrower) {
        return dispute?.respondedAt == null
            ? '$other reported a problem. Give your side; Sajha decides what happens to the deposit.'
            : 'Sajha is looking at the claim and your reply. We’ll let you both know.';
      }
      return 'Sajha is looking at your claim and will decide what happens to the deposit.';
    case BookingStatus.completed:
      final kept = d.rental?.keptPaise ?? 0;
      final back = b.depositPaise - kept;
      return b.isBorrower
          ? back > 0
                ? 'All done. ${formatRupees(back)} of your deposit is coming back.'
                : 'All done. The deposit went to $other.'
          : kept > 0
          ? 'All done. Your earnings are on their way, plus ${formatRupees(kept)} from the deposit.'
          : 'All done. Your earnings are on their way.';
    case BookingStatus.cancelled:
      final by = switch (b.cancelledBy) {
        'BORROWER' => b.isBorrower ? 'You' : other,
        'LENDER' => b.isBorrower ? other : 'You',
        _ => 'Sajha',
      };
      return b.cancelReason == null
          ? '$by cancelled this booking.'
          : '$by cancelled this booking: “${b.cancelReason}”';
  }
}

/// A line for each timeline event.
String eventText(BookingEvent e, Booking b) {
  final who = switch (e.by) {
    'SYSTEM' => 'Sajha',
    'ADMIN' => 'Sajha support',
    'BORROWER' => b.isBorrower ? 'You' : b.other.firstName,
    _ => b.isBorrower ? b.other.firstName : 'You',
  };
  return switch (e.type) {
    BookingEventType.requested => '$who requested to book',
    BookingEventType.accepted =>
      e.note == 'Offer agreed in chat'
          ? 'Deal agreed in chat'
          : '$who accepted',
    BookingEventType.declined => '$who declined',
    BookingEventType.expired => 'Expired',
    BookingEventType.cancelled => '$who cancelled',
    BookingEventType.docsSubmitted => '$who shared documents',
    BookingEventType.docsApproved => '$who approved the documents',
    BookingEventType.docsRejected => '$who didn’t accept the documents',
    BookingEventType.paid => 'Paid: booking confirmed',
    BookingEventType.handedOver => 'Handed over',
    BookingEventType.returned => 'Returned',
    BookingEventType.noShow => '$who: borrower didn’t come',
    BookingEventType.disputed => '$who reported a problem',
    BookingEventType.completed => 'Rental complete',
    BookingEventType.disputeResolved => 'Sajha decided the claim',
  };
}

/// "Cancellation refund", "Late payment refund", "Refund from Sajha".
String refundText(BookingRefund r) => switch (r.kind) {
  RefundKind.cancellation => 'Cancellation refund',
  RefundKind.latePayment => 'Late payment refund',
  RefundKind.manual => 'Refund from Sajha',
  RefundKind.depositReturn => 'Deposit back',
};

/// "Expires in 5h 12m", ticking once a minute.
class Countdown extends StatefulWidget {
  const Countdown({required this.until, required this.prefix, super.key});

  final DateTime until;
  final String prefix;

  @override
  State<Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<Countdown> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(minutes: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final left = widget.until.difference(DateTime.now());
    return Text(
      left.isNegative ? 'Time’s up' : '${widget.prefix} ${timeLeft(left)}',
      key: const ValueKey('booking-countdown'),
      style: const TextStyle(fontWeight: FontWeight.w600),
    );
  }
}
