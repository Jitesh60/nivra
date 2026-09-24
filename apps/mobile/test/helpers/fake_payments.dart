part of 'fake_api.dart';

/// Payments and payouts kept by [FakeSajhaApi] (a simplified copy of the
/// API's payments module: the fake provider, refund tiers, Route payouts).
class FakePayments {
  /// What `POST /bookings/:id/pay` says the provider is: `fake` (test
  /// checkout) or `razorpay` (the SDK, faked by FakePaymentGateway).
  String provider = 'fake';

  /// By order id.
  final orders = <String, FakePayment>{};

  /// By lender id.
  final accounts = <String, Map<String, dynamic>>{};
  final transfers = <FakeTransfer>[];
}

class FakePayment {
  FakePayment(this.orderId, this.bookingId, this.amount);
  final String orderId;
  final String bookingId;
  final int amount;
  String status = 'CREATED';
  String? paymentId;
  DateTime? paidAt;
  final refunds = <Map<String, dynamic>>[];

  int get refunded =>
      refunds.fold(0, (sum, r) => sum + (r['amountPaise'] as int));
}

class FakeTransfer {
  FakeTransfer(this.bookingId, this.lenderId, this.amount, this.status);
  final String bookingId;
  final String lenderId;
  final int amount;
  String status;
  bool onHold = true;
  final createdAt = DateTime.now().toUtc();
}

/// The fake provider signs with this; `verify` checks it.
String fakeSignature(String orderId, String paymentId) =>
    'sig_${orderId}_$paymentId';

extension FakePaymentsApi on FakeSajhaApi {
  // ─── Helpers for tests ────────────────────────────────────────────────────

  /// The booking's latest order, if it has one.
  FakePayment? orderFor(String bookingId) =>
      payments.orders.values.where((p) => p.bookingId == bookingId).lastOrNull;

  /// Razorpay's `payment.captured` webhook for [orderId] (confirms the
  /// booking if verify hasn't already).
  void deliverCaptured(String orderId, {String? paymentId}) {
    final p = payments.orders[orderId]!;
    _capture(p, paymentId ?? p.paymentId ?? 'pay_${++_seq}');
  }

  /// Pays for [bookingId] as its borrower would, from another phone.
  void payAs(String bookingId) {
    final b = bookingState.bookings[bookingId]!;
    final (_, json) = _payments(
      'POST',
      '/bookings/$bookingId/pay',
      const {},
      _users[b.borrowerId]!,
    )!;
    deliverCaptured((json! as Map)['orderId'] as String);
  }

  /// Razorpay activates (or rejects) the lender's linked account.
  void setAccountStatus(String lenderId, String status) {
    payments.accounts[lenderId]!['status'] = status;
    if (status == 'ACTIVATED') {
      for (final t in payments.transfers) {
        if (t.lenderId == lenderId && t.status == 'AWAITING_ACCOUNT') {
          t.status = 'ON_HOLD';
        }
      }
    }
  }

  // ─── Endpoints ───────────────────────────────────────────────────────────

  (int, Object?)? _payments(
    String method,
    String path,
    Map<String, dynamic> body,
    _User user,
  ) {
    switch ('$method $path') {
      case 'POST /payments/verify':
        final p = payments.orders[body['orderId']];
        final b = p == null ? null : bookingState.bookings[p.bookingId];
        if (p == null || b == null || b.borrowerId != user.id) {
          return _error(404, 'NOT_FOUND', 'Payment not found');
        }
        if (body['signature'] !=
            fakeSignature(p.orderId, body['paymentId'] as String)) {
          return _error(
            400,
            'PAYMENT_SIGNATURE_INVALID',
            'We couldn’t confirm this payment. If money left your account, '
                'it will be refunded.',
          );
        }
        _capture(p, body['paymentId'] as String);
        return (200, {'bookingId': b.id, 'status': b.status});
      case 'GET /me/payout-account':
        return (200, payments.accounts[user.id]);
      case 'PUT /me/payout-account':
        final existing = payments.accounts[user.id];
        if (existing != null && existing['status'] != 'REJECTED') {
          return _error(
            409,
            'PAYOUT_ACCOUNT_INVALID',
            'Your payout account is already set up.',
          );
        }
        if (!RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$')
            .hasMatch(body['ifsc'] as String)) {
          return _error(
            400,
            'VALIDATION_FAILED',
            'ifsc must look like HDFC0001234',
          );
        }
        final account = {
          'status': 'PENDING',
          'statusReason': null,
          'beneficiaryName': body['beneficiaryName'],
          'bankLast4': (body['accountNumber'] as String).substring(
            (body['accountNumber'] as String).length - 4,
          ),
          'ifsc': body['ifsc'],
          'panLast4': (body['pan'] as String).substring(6),
        };
        payments.accounts[user.id] = account;
        return (200, account);
      case 'GET /me/earnings':
        final mine =
            payments.transfers.where((t) => t.lenderId == user.id).toList()
              ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        int sum(bool Function(FakeTransfer t) where) =>
            mine.where(where).fold(0, (s, t) => s + t.amount);
        return (
          200,
          {
            'account': payments.accounts[user.id],
            'totals': {
              'onHoldPaise': sum((t) => t.status == 'ON_HOLD'),
              'paidPaise': sum((t) => t.status == 'RELEASED'),
              'awaitingAccountPaise': sum(
                (t) => t.status == 'AWAITING_ACCOUNT',
              ),
            },
            'items': [
              for (final t in mine)
                {
                  'bookingId': t.bookingId,
                  'listingTitle':
                      listings[bookingState.bookings[t.bookingId]!.listingId]!
                          .title,
                  'startDate': bookingState.bookings[t.bookingId]!.start,
                  'endDate': bookingState.bookings[t.bookingId]!.end,
                  'amountPaise': t.amount,
                  'status': t.status,
                  'onHold': t.onHold,
                  'createdAt': t.createdAt.toIso8601String(),
                },
            ],
          },
        );
    }

    final parts = path.split('/');
    // POST /dev/payments/:orderId/checkout
    if (method == 'POST' &&
        parts.length == 5 &&
        parts[1] == 'dev' &&
        parts[2] == 'payments' &&
        parts[4] == 'checkout') {
      final p = payments.orders[parts[3]];
      if (p == null || payments.provider != 'fake') {
        return _error(404, 'NOT_FOUND', 'Order not found');
      }
      if (body['outcome'] == 'failure') {
        p.status = 'FAILED';
        return (
          200,
          {
            'paymentId': null,
            'signature': null,
            'error': 'Your bank declined this payment (test).',
          },
        );
      }
      final paymentId = 'pay_${++_seq}';
      p.paymentId = paymentId;
      if (body['webhook'] == 'now') _capture(p, paymentId);
      return (
        200,
        {
          'paymentId': paymentId,
          'signature': fakeSignature(p.orderId, paymentId),
          'error': null,
        },
      );
    }
    // /bookings/:id/pay and /bookings/:id/cancel-preview
    if (parts.length == 4 && parts[1] == 'bookings') {
      final b = bookingState.bookings[parts[2]];
      if (b == null || (b.borrowerId != user.id && b.lenderId != user.id)) {
        return null; // Bookings answers the 404.
      }
      if (method == 'POST' && parts[3] == 'pay') {
        if (b.borrowerId != user.id || b.status != 'AWAITING_PAYMENT') {
          return _error(
            409,
            'PAYMENT_NOT_ALLOWED',
            'This booking can’t be paid now.',
          );
        }
        final open = orderFor(b.id);
        final order = open != null && open.status != 'CAPTURED'
            ? (open..status = 'CREATED')
            : FakePayment('order_${++_seq}', b.id, b.rent + b.deposit);
        payments.orders[order.orderId] = order;
        return (
          200,
          {
            'provider': payments.provider,
            'keyId': 'rzp_test_fake',
            'orderId': order.orderId,
            'amountPaise': order.amount,
            'currency': 'INR',
            'description': listings[b.listingId]!.title,
            'prefill': {
              'name': user.name,
              'email': user.email,
              'contact': user.phone,
            },
          },
        );
      }
      if (method == 'GET' && parts[3] == 'cancel-preview') {
        return (200, _cancelPreview(b, lender: b.lenderId == user.id));
      }
    }
    return null;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  void _capture(FakePayment p, String paymentId) {
    if (p.status == 'CAPTURED') return; // Verify and webhook both arrive.
    final b = bookingState.bookings[p.bookingId]!;
    p
      ..status = 'CAPTURED'
      ..paymentId = paymentId
      ..paidAt = DateTime.now().toUtc();
    if (b.status != 'AWAITING_PAYMENT') {
      // Too late (expired or cancelled meanwhile): everything goes back.
      _refund(p, p.amount, 'LATE_PAYMENT');
      return;
    }
    final account = payments.accounts[b.lenderId];
    payments.transfers.add(
      FakeTransfer(
        b.id,
        b.lenderId,
        b.rent - b.rent ~/ 10,
        account?['status'] == 'ACTIVATED' ? 'ON_HOLD' : 'AWAITING_ACCOUNT',
      ),
    );
    _move(b, 'CONFIRMED', 'PAID', null);
    _system(
      chat.conversations[b.conversationId]!,
      b.borrowerId,
      'Booking confirmed',
    );
    for (final u in [b.borrowerId, b.lenderId]) {
      _notify(
        u,
        'booking.confirmed',
        'Booking confirmed',
        'Paid and confirmed.',
        b.id,
        push: true,
      );
    }
  }

  /// A paid booking was cancelled: refund per the tiers, reverse the payout.
  void _refundCancelled(FakeBooking b, {required bool lender}) {
    final p = orderFor(b.id);
    if (p == null || p.status != 'CAPTURED') return;
    final preview = _cancelPreview(b, lender: lender);
    _refund(p, preview['refundPaise'] as int, 'CANCELLATION');
    for (final t in payments.transfers) {
      if (t.bookingId == b.id && t.status != 'REVERSED') t.status = 'REVERSED';
    }
  }

  void _refund(FakePayment p, int amount, String kind) {
    p.refunds.add({
      'amountPaise': amount,
      'kind': kind,
      'status': 'PENDING',
      'createdAt': DateTime.now().toUtc().toIso8601String(),
    });
    p.status = p.refunded >= p.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  }

  Map<String, dynamic> _cancelPreview(FakeBooking b, {required bool lender}) {
    final paid = orderFor(b.id)?.status == 'CAPTURED';
    if (!paid) {
      return {
        'refundPaise': 0,
        'rentPaise': 0,
        'feePaise': 0,
        'depositPaise': 0,
        'tier': null,
        'summary': 'Nothing has been paid, so there’s nothing to refund.',
      };
    }
    // The rental starts at midnight IST on the start date.
    final start = DateTime.parse('${b.start}T00:00:00Z')
        .subtract(const Duration(hours: 5, minutes: 30));
    final hours = start.difference(DateTime.now().toUtc()).inMinutes / 60;
    final tier = lender || hours > 48
        ? 'FULL'
        : hours >= 24
        ? 'HALF_RENT'
        : 'DEPOSIT_ONLY';
    final rent = switch (tier) {
      'FULL' => b.rent,
      'HALF_RENT' => (b.rent / 2).round(),
      _ => 0,
    };
    final total = rent + b.deposit;
    final rupees = '₹${total ~/ 100}';
    return {
      'refundPaise': total,
      'rentPaise': rent,
      'feePaise': 0,
      'depositPaise': b.deposit,
      'tier': tier,
      'summary': lender
          ? 'The borrower gets everything back ($rupees), and the '
                'cancellation counts against you.'
          : switch (tier) {
              'FULL' => 'You get everything back: $rupees.',
              'HALF_RENT' =>
                'Less than 48 hours before pickup: you get half the rent '
                    'and the deposit back, $rupees.',
              _ =>
                'Less than 24 hours before pickup: you get the deposit '
                    'back, $rupees; the rent isn’t refunded.',
            },
    };
  }

  Map<String, dynamic>? _paymentJson(FakeBooking b) {
    final p = orderFor(b.id);
    if (p == null || p.status == 'CREATED') return null;
    return {
      'status': p.status,
      'amountPaise': p.amount,
      'method': p.status == 'FAILED' ? null : 'upi',
      'paidAt': p.paidAt?.toIso8601String(),
      'refundedPaise': p.refunded,
      'refunds': p.refunds,
    };
  }
}
