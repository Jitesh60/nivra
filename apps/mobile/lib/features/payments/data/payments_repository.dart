import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/payments/payment_gateway.dart';
import 'models.dart';

/// Paying for bookings, and the lender's payouts. Throws [ApiException].
class PaymentsRepository {
  PaymentsRepository({required this._dio});

  final Dio _dio;

  /// Opens (or reuses) the Razorpay order for a booking waiting for payment.
  Future<CheckoutRequest> checkout(String bookingId) async =>
      CheckoutRequest.fromJson(
        await _call(
          () => _dio.post<Map<String, dynamic>>('/bookings/$bookingId/pay'),
        ),
      );

  /// Reports a successful checkout; returns the booking's status now
  /// (CONFIRMED once the API has checked the signature).
  Future<String> verify(CheckoutSuccess s) async {
    final json = await _call(
      () => _dio.post<Map<String, dynamic>>(
        '/payments/verify',
        data: {
          'orderId': s.orderId,
          'paymentId': s.paymentId,
          'signature': s.signature,
        },
      ),
    );
    return json['status'] as String;
  }

  /// Development only (`PAYMENT_PROVIDER=fake`): plays the checkout. The API
  /// sends the signed webhook shortly after, as Razorpay would.
  Future<CheckoutResult> testCheckout(
    String orderId, {
    required bool succeed,
  }) async {
    final json = await _call(
      () => _dio.post<Map<String, dynamic>>(
        '/dev/payments/$orderId/checkout',
        data: {'outcome': succeed ? 'success' : 'failure', 'webhook': 'later'},
      ),
    );
    final paymentId = json['paymentId'] as String?;
    final signature = json['signature'] as String?;
    if (!succeed || paymentId == null || signature == null) {
      return CheckoutFailure(
        json['error'] as String? ??
            'The payment didn’t go through. No money was taken.',
      );
    }
    return CheckoutSuccess(
      orderId: orderId,
      paymentId: paymentId,
      signature: signature,
    );
  }

  /// Null until the lender sets up payouts.
  Future<PayoutAccount?> payoutAccount() async {
    // The API answers `null` with an empty body.
    final json = await _call(() => _dio.get<Object?>('/me/payout-account'));
    return json is Map<String, dynamic> && json.isNotEmpty
        ? PayoutAccount.fromJson(json)
        : null;
  }

  Future<PayoutAccount> setUpPayouts(PayoutAccountInput input) async =>
      PayoutAccount.fromJson(
        await _call(
          () => _dio.put<Map<String, dynamic>>(
            '/me/payout-account',
            data: input.toJson(),
          ),
        ),
      );

  Future<Earnings> earnings() async => Earnings.fromJson(
    await _call(() => _dio.get<Map<String, dynamic>>('/me/earnings')),
  );

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final paymentsRepositoryProvider = Provider<PaymentsRepository>(
  (ref) => PaymentsRepository(dio: ref.watch(dioProvider)),
);
