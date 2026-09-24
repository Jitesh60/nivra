import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../../bookings/application/bookings_providers.dart';
import '../../bookings/data/models.dart';
import '../data/rentals_repository.dart';

final bookingCodeProvider = FutureProvider.autoDispose
    .family<BookingCode, String>(
      (ref, bookingId) => ref.read(rentalsRepositoryProvider).code(bookingId),
    );

/// The code the other person scans (or types) to confirm the handover or the
/// return. Closes itself once they have.
class ShowCodeScreen extends ConsumerWidget {
  const ShowCodeScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final code = ref.watch(bookingCodeProvider(bookingId));
    // The other person confirmed: the booking moved on.
    ref.listen(bookingProvider(bookingId), (_, next) {
      final status = next.value?.booking.status;
      final stage = code.value?.stage;
      final done =
          (stage == RentalStage.handover &&
              status != BookingStatus.confirmed) ||
          (stage == RentalStage.returned && status != BookingStatus.active);
      if (status != null && stage != null && done && context.mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              stage == RentalStage.handover
                  ? 'Handed over'
                  : 'Return confirmed',
            ),
          ),
        );
      }
    });
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(
        title: Text(switch (code.value?.stage) {
          RentalStage.returned => 'Return code',
          _ => 'Handover code',
        }),
      ),
      body: switch (code) {
        AsyncData(:final value) => ListView(
          padding: const EdgeInsets.all(SajhaSpacing.xl),
          children: [
            Text(
              value.stage == RentalStage.handover
                  ? 'Show this to the lender when you pick the item up. '
                        'They scan it, or type the 6 digits.'
                  : 'Show this to the borrower when they bring the item back. '
                        'They scan it, or type the 6 digits.',
              textAlign: TextAlign.center,
              style: text.bodyMedium?.copyWith(color: muted),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            Center(
              child: Container(
                padding: const EdgeInsets.all(SajhaSpacing.md),
                color: Colors.white,
                child: QrImageView(
                  key: const ValueKey('rental-qr'),
                  data: value.qr,
                  size: 240,
                ),
              ),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            Text(
              '${value.code.substring(0, 3)} ${value.code.substring(3)}',
              key: const ValueKey('rental-code'),
              textAlign: TextAlign.center,
              style: text.displaySmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: 6,
              ),
            ),
            const SizedBox(height: SajhaSpacing.lg),
            Text(
              'Only share it in person, when the item actually changes hands.',
              textAlign: TextAlign.center,
              style: text.bodySmall?.copyWith(color: muted),
            ),
          ],
        ),
        AsyncError(:final error) => Center(
          child: Padding(
            padding: const EdgeInsets.all(SajhaSpacing.xl),
            child: Text(
              error is ApiException
                  ? error.friendlyMessage
                  : 'Couldn’t load the code.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}
