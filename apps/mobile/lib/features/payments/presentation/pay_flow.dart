import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/config/providers.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/payments/payment_gateway.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show formatRupees;
import '../data/payments_repository.dart';

/// Pays for a booking: opens the order, runs the checkout, then hands over
/// to the processing screen. Failures offer another go.
Future<void> payForBooking(
  BuildContext context,
  WidgetRef ref,
  String bookingId,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final CheckoutRequest request;
  try {
    request = await ref.read(paymentsRepositoryProvider).checkout(bookingId);
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    return;
  }
  if (!context.mounted) return;

  final CheckoutResult result;
  if (request.isTest) {
    // The API only hands out test orders outside production; a prod build
    // never shows the test checkout.
    result = ref.read(appConfigProvider).isProd
        ? const CheckoutFailure('Payments aren’t available right now.')
        : await showTestCheckout(context, request);
  } else {
    result = await ref.read(paymentGatewayProvider).open(request);
  }
  if (!context.mounted) return;

  switch (result) {
    case CheckoutCancelled():
      return;
    case CheckoutFailure(:final message):
      final retry = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Payment didn’t go through'),
          content: Text(message, key: const ValueKey('pay-failed-message')),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Close'),
            ),
            FilledButton(
              key: const ValueKey('pay-retry'),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Try again'),
            ),
          ],
        ),
      );
      if (retry == true && context.mounted) {
        await payForBooking(context, ref, bookingId);
      }
    case CheckoutSuccess():
      await context.push(Routes.bookingPaying(bookingId), extra: result);
  }
}

/// Development builds against `PAYMENT_PROVIDER=fake`: stands in for the
/// Razorpay checkout. No real money moves.
Future<CheckoutResult> showTestCheckout(
  BuildContext context,
  CheckoutRequest request,
) async =>
    await showModalBottomSheet<CheckoutResult>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TestCheckoutSheet(request),
    ) ??
    const CheckoutCancelled();

class _TestCheckoutSheet extends ConsumerStatefulWidget {
  const _TestCheckoutSheet(this.request);

  final CheckoutRequest request;

  @override
  ConsumerState<_TestCheckoutSheet> createState() => _TestCheckoutSheetState();
}

class _TestCheckoutSheetState extends ConsumerState<_TestCheckoutSheet> {
  bool _busy = false;

  Future<void> _pay({required bool succeed}) async {
    setState(() => _busy = true);
    final navigator = Navigator.of(context);
    CheckoutResult result;
    try {
      result = await ref
          .read(paymentsRepositoryProvider)
          .testCheckout(widget.request.orderId, succeed: succeed);
    } on ApiException catch (e) {
      result = CheckoutFailure(e.friendlyMessage);
    }
    if (mounted) navigator.pop(result);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        child: Column(
          key: const ValueKey('test-checkout'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.science_outlined),
                const SizedBox(width: SajhaSpacing.sm),
                Text('Test payment', style: text.titleMedium),
              ],
            ),
            const SizedBox(height: SajhaSpacing.xs),
            Text(
              'This build uses Nivra’s test checkout. No real money moves.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
            const SizedBox(height: SajhaSpacing.md),
            Text(widget.request.description),
            Text(
              formatRupees(widget.request.amountPaise),
              style: text.headlineSmall,
            ),
            const SizedBox(height: SajhaSpacing.lg),
            FilledButton(
              key: const ValueKey('test-pay-success'),
              onPressed: _busy ? null : () => _pay(succeed: true),
              child: Text('Pay ${formatRupees(widget.request.amountPaise)}'),
            ),
            TextButton(
              key: const ValueKey('test-pay-fail'),
              onPressed: _busy ? null : () => _pay(succeed: false),
              child: const Text('Simulate a failed payment'),
            ),
          ],
        ),
      ),
    );
  }
}
