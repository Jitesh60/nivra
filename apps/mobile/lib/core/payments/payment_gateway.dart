import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

/// What the checkout needs: the order Sajha created with Razorpay.
class CheckoutRequest {
  const CheckoutRequest({
    required this.provider,
    required this.keyId,
    required this.orderId,
    required this.amountPaise,
    required this.currency,
    required this.description,
    required this.contact,
    this.name,
    this.email,
  });

  factory CheckoutRequest.fromJson(Map<String, dynamic> json) {
    final prefill = json['prefill'] as Map<String, dynamic>;
    return CheckoutRequest(
      provider: json['provider'] as String,
      keyId: json['keyId'] as String,
      orderId: json['orderId'] as String,
      amountPaise: (json['amountPaise'] as num).toInt(),
      currency: json['currency'] as String,
      description: json['description'] as String,
      name: prefill['name'] as String?,
      email: prefill['email'] as String?,
      contact: prefill['contact'] as String,
    );
  }

  /// `razorpay`, or `fake` (development: the test checkout, no real money).
  final String provider;
  final String keyId;
  final String orderId;
  final int amountPaise;
  final String currency;
  final String description;
  final String? name;
  final String? email;
  final String contact;

  bool get isTest => provider == 'fake';
}

sealed class CheckoutResult {
  const CheckoutResult();
}

/// Paid. The API checks [signature] before trusting it.
class CheckoutSuccess extends CheckoutResult {
  const CheckoutSuccess({
    required this.orderId,
    required this.paymentId,
    required this.signature,
  });
  final String orderId;
  final String paymentId;
  final String signature;
}

class CheckoutFailure extends CheckoutResult {
  const CheckoutFailure(this.message);
  final String message;
}

/// The borrower closed the checkout.
class CheckoutCancelled extends CheckoutResult {
  const CheckoutCancelled();
}

/// Opens the payment provider's checkout (cards, UPI, netbanking) for one
/// order. Faked in tests.
abstract interface class PaymentGateway {
  Future<CheckoutResult> open(CheckoutRequest request);
}

/// Razorpay Standard Checkout via `razorpay_flutter`.
class RazorpayGateway implements PaymentGateway {
  @override
  Future<CheckoutResult> open(CheckoutRequest r) async {
    final razorpay = Razorpay();
    final done = Completer<CheckoutResult>();
    void finish(CheckoutResult result) {
      if (!done.isCompleted) done.complete(result);
    }

    razorpay
      ..on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse res) {
        final paymentId = res.paymentId;
        final signature = res.signature;
        finish(
          paymentId == null || signature == null
              ? const CheckoutFailure('The payment didn’t complete.')
              : CheckoutSuccess(
                  orderId: res.orderId ?? r.orderId,
                  paymentId: paymentId,
                  signature: signature,
                ),
        );
      })
      ..on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse res) {
        finish(
          res.code == Razorpay.PAYMENT_CANCELLED
              ? const CheckoutCancelled()
              : CheckoutFailure(
                  res.code == Razorpay.NETWORK_ERROR
                      ? 'No connection. Check your internet and try again.'
                      : 'The payment didn’t go through. No money was taken.',
                ),
        );
      })
      // Wallets that hand off to their own app come back as a success or
      // an error through the webhook; nothing to do here.
      ..on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse _) {});

    try {
      razorpay.open({
        'key': r.keyId,
        'amount': r.amountPaise,
        'currency': r.currency,
        'order_id': r.orderId,
        'name': 'Sajha',
        'description': r.description,
        'prefill': {
          'contact': r.contact,
          if (r.email != null) 'email': r.email,
          if (r.name != null) 'name': r.name,
        },
        'theme': {'color': '#11846A'},
      });
    } on MissingPluginException {
      finish(
        const CheckoutFailure('Payments aren’t available on this device.'),
      );
    }
    try {
      return await done.future;
    } finally {
      razorpay.clear();
    }
  }
}

final paymentGatewayProvider = Provider<PaymentGateway>(
  (ref) => RazorpayGateway(),
);
