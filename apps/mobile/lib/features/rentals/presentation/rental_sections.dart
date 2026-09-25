import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';
import '../../bookings/data/models.dart';
import '../../bookings/presentation/booking_format.dart' show whenText;
import '../../listings/data/models.dart' show formatRupees;
import 'photo_viewer.dart';

/// Due today, or overdue with the late fee so far.
class LateBanner extends StatelessWidget {
  const LateBanner(this.d, {super.key});

  final BookingDetail d;

  static bool shows(BookingDetail d) {
    final r = d.rental;
    if (r == null || d.booking.status != BookingStatus.active) return false;
    return r.lateDays > 0 ||
        r.dueAt.difference(DateTime.now()) < const Duration(hours: 24);
  }

  @override
  Widget build(BuildContext context) {
    final r = d.rental!;
    final b = d.booking;
    final late = r.lateDays > 0;
    final color = late ? SajhaColors.danger : SajhaColors.warning;
    final message = late
        ? b.isBorrower
              ? '${r.lateDays} ${r.lateDays == 1 ? 'day' : 'days'} late. '
                    'The late fee so far is ${formatRupees(r.lateFeePaise)}, '
                    'from your deposit. Please return it today.'
              : 'Not back yet: ${r.lateDays} ${r.lateDays == 1 ? 'day' : 'days'} '
                    'late. The late fee so far is ${formatRupees(r.lateFeePaise)}.'
        : b.isBorrower
        ? 'Due back by ${whenText(r.dueAt.subtract(const Duration(minutes: 1)))}. '
              'After that, ${formatRupees(b.pricePerDayPaise)} a day comes out '
              'of your deposit.'
        : 'Due back today.';
    return Card(
      key: const ValueKey('late-banner'),
      color: color.withValues(alpha: 0.1),
      margin: const EdgeInsets.only(bottom: SajhaSpacing.sm),
      child: ListTile(
        leading: Icon(
          late ? Icons.warning_amber_rounded : Icons.schedule,
          color: color,
        ),
        title: Text(message),
      ),
    );
  }
}

/// Handover and return photos, per person.
class ConditionPhotosSection extends StatelessWidget {
  const ConditionPhotosSection(this.d, {super.key});

  final BookingDetail d;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final b = d.booking;
    String who(ConditionReport r) => r.byBorrower == b.isBorrower
        ? 'You'
        : '${b.other.firstName} (${r.byBorrower ? 'borrower' : 'lender'})';
    return Column(
      key: const ValueKey('condition-photos'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: SajhaSpacing.xl),
        Text('Condition photos', style: text.titleSmall),
        for (final (i, r) in d.conditionReports.indexed) ...[
          const SizedBox(height: SajhaSpacing.sm),
          Text(
            '${r.stage.label} · ${who(r)} · ${whenText(r.at)}',
            style: text.bodySmall?.copyWith(color: muted),
          ),
          if (r.note != null) Text('“${r.note}”'),
          const SizedBox(height: SajhaSpacing.xs),
          PhotoStrip(
            photos: r.photos,
            title: r.stage.label,
            keyPrefix: 'condition-$i',
          ),
        ],
      ],
    );
  }
}

/// The lender's claim, the borrower's reply and Nivra's decision.
class DisputeSection extends StatelessWidget {
  const DisputeSection(this.d, {super.key});

  final BookingDetail d;

  @override
  Widget build(BuildContext context) {
    final dispute = d.dispute!;
    final b = d.booking;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final lender = b.isBorrower ? b.other.firstName : 'You';
    final borrower = b.isBorrower ? 'You' : b.other.firstName;
    return Column(
      key: const ValueKey('dispute-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: SajhaSpacing.xl),
        Text('Problem reported', style: text.titleSmall),
        const SizedBox(height: SajhaSpacing.xs),
        Text(
          '$lender: ${dispute.reason.label}, asking to keep '
          '${formatRupees(dispute.claimPaise)}',
          key: const ValueKey('dispute-claim'),
        ),
        Text('“${dispute.description}”', style: text.bodyMedium),
        if (dispute.evidence.isNotEmpty) ...[
          const SizedBox(height: SajhaSpacing.xs),
          PhotoStrip(
            photos: dispute.evidence,
            title: 'Claim',
            keyPrefix: 'evidence',
          ),
        ],
        if (dispute.responseNote != null) ...[
          const SizedBox(height: SajhaSpacing.sm),
          Text('$borrower replied:', style: text.bodySmall),
          Text(
            '“${dispute.responseNote}”',
            key: const ValueKey('dispute-response'),
          ),
          if (dispute.responsePhotos.isNotEmpty) ...[
            const SizedBox(height: SajhaSpacing.xs),
            PhotoStrip(
              photos: dispute.responsePhotos,
              title: 'Reply',
              keyPrefix: 'response',
            ),
          ],
        ],
        const SizedBox(height: SajhaSpacing.sm),
        if (dispute.resolved)
          Text(
            'Nivra decided: ${formatRupees(dispute.keptPaise ?? 0)} to the '
            'lender, the rest of the deposit back to the borrower.'
            '${dispute.resolutionNote == null ? '' : ' “${dispute.resolutionNote}”'}',
            key: const ValueKey('dispute-outcome'),
            style: const TextStyle(fontWeight: FontWeight.w600),
          )
        else
          Text(
            'Nivra is reviewing this.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
      ],
    );
  }
}

/// Your review and theirs (once it's published).
class ReviewsSection extends StatelessWidget {
  const ReviewsSection(this.d, {super.key});

  final BookingDetail d;

  static bool shows(BookingDetail d) =>
      d.reviews.mine != null || d.reviews.theirs != null;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final other = d.booking.other.firstName;
    final mine = d.reviews.mine;
    final theirs = d.reviews.theirs;
    return Column(
      key: const ValueKey('reviews-section'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: SajhaSpacing.xl),
        Text('Reviews', style: text.titleSmall),
        if (mine != null)
          ListTile(
            key: const ValueKey('review-mine'),
            contentPadding: EdgeInsets.zero,
            title: Text('You: ${stars(mine.rating)}'),
            subtitle: Text(
              [
                if (mine.comment != null) '“${mine.comment}”',
                if (mine.publishedAt == null)
                  'Hidden until $other reviews you too, or a week passes',
              ].join('\n'),
            ),
          ),
        if (theirs != null)
          ListTile(
            key: const ValueKey('review-theirs'),
            contentPadding: EdgeInsets.zero,
            title: Text('$other: ${stars(theirs.rating)}'),
            subtitle: theirs.comment == null
                ? null
                : Text('“${theirs.comment}”'),
          )
        else if (mine != null)
          Text(
            '$other hasn’t reviewed you yet.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
      ],
    );
  }
}

/// "★★★★☆".
String stars(int rating) => '★' * rating + '☆' * (5 - rating);
