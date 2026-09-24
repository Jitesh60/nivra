import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/payments/payment_gateway.dart';
import '../../../core/theme/tokens.g.dart';
import '../../bookings/application/bookings_providers.dart';
import '../../bookings/data/models.dart';
import '../data/payments_repository.dart';

/// After the checkout: reports the payment and waits for the booking to be
/// confirmed (by the verify call, or by Razorpay's webhook arriving live).
class PaymentProcessingScreen extends ConsumerStatefulWidget {
  const PaymentProcessingScreen({
    required this.bookingId,
    required this.payment,
    super.key,
  });

  final String bookingId;
  final CheckoutSuccess payment;

  /// After this long, say it's taking a while (it still confirms later).
  static const patience = Duration(seconds: 45);

  @override
  ConsumerState<PaymentProcessingScreen> createState() =>
      _PaymentProcessingScreenState();
}

class _PaymentProcessingScreenState
    extends ConsumerState<PaymentProcessingScreen> {
  String? _error;
  bool _slow = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(PaymentProcessingScreen.patience, () {
      if (mounted) setState(() => _slow = true);
    });
    unawaited(_verify());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _verify() async {
    try {
      await ref.read(paymentsRepositoryProvider).verify(widget.payment);
      await ref.read(bookingProvider(widget.bookingId).notifier).refresh();
    } on ApiException catch (e) {
      // A dropped connection isn't a failed payment: the webhook still
      // confirms it, and the booking updates live.
      if (!e.isNetwork && mounted) setState(() => _error = e.friendlyMessage);
    }
  }

  @override
  Widget build(BuildContext context) {
    final booking = ref.watch(bookingProvider(widget.bookingId)).value;
    final confirmed =
        booking != null &&
        booking.booking.status != BookingStatus.awaitingPayment &&
        (booking.payment?.status.paid ?? false);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    final (Widget icon, String title, String body) = confirmed
        ? (
            const Icon(
              Icons.check_circle,
              size: 72,
              color: SajhaColors.success,
            ),
            booking.booking.status == BookingStatus.confirmed
                ? 'You’re booked!'
                : 'Payment received',
            booking.booking.status == BookingStatus.confirmed
                ? 'We’ve told ${booking.booking.other.firstName}. The pickup '
                      'address is on your booking now.'
                : 'Your booking has changed meanwhile, so any money due back '
                      'is on its way to you. Details are on your booking.',
          )
        : _error != null
        ? (
            const Icon(
              Icons.error_outline,
              size: 72,
              color: SajhaColors.danger,
            ),
            'We couldn’t confirm this payment',
            _error!,
          )
        : (
            const SizedBox.square(
              dimension: 56,
              child: CircularProgressIndicator(),
            ),
            'Confirming your payment…',
            _slow
                ? 'This is taking longer than usual. You can leave this '
                      'screen: we’ll notify you as soon as it’s confirmed.'
                : 'This usually takes a few seconds. Please don’t pay again.',
          );

    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment'),
        automaticallyImplyLeading: confirmed || _error != null || _slow,
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(SajhaSpacing.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              icon,
              const SizedBox(height: SajhaSpacing.lg),
              Text(
                title,
                key: const ValueKey('paying-title'),
                style: text.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: SajhaSpacing.sm),
              Text(
                body,
                key: const ValueKey('paying-body'),
                style: text.bodyMedium?.copyWith(color: muted),
                textAlign: TextAlign.center,
              ),
              if (confirmed || _error != null || _slow) ...[
                const SizedBox(height: SajhaSpacing.xl),
                FilledButton(
                  key: const ValueKey('paying-done'),
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('View booking'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
