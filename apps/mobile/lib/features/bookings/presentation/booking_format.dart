import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show BlockedRange;
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
    case BookingStatus.confirmed:
      return b.isBorrower
          ? 'Confirmed! Pick it up from $other on ${formatRange(BlockedRange(b.startDate, b.startDate))}. The address is below.'
          : 'Confirmed and paid. $other picks it up on ${formatRange(BlockedRange(b.startDate, b.startDate))}.';
    case BookingStatus.declined:
      return b.declineReason == null
          ? 'This request was declined.'
          : 'Declined: “${b.declineReason}”';
    case BookingStatus.expired:
      return 'This booking expired before the next step was done.';
    case BookingStatus.cancelled:
      final by = switch (b.cancelledBy) {
        'BORROWER' => b.isBorrower ? 'You' : other,
        'LENDER' => b.isBorrower ? other : 'You',
        _ => 'Sajha',
      };
      return b.cancelReason == null
          ? '$by cancelled this booking.'
          : '$by cancelled this booking: “${b.cancelReason}”';
    default:
      return b.status.label;
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
  };
}

/// "Cancellation refund", "Late payment refund", "Refund from Sajha".
String refundText(BookingRefund r) => switch (r.kind) {
  RefundKind.cancellation => 'Cancellation refund',
  RefundKind.latePayment => 'Late payment refund',
  RefundKind.manual => 'Refund from Sajha',
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
