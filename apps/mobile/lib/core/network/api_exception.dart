import 'package:dio/dio.dart';

/// An error from the Sajha API (`{ error: { code, message, details } }`)
/// or from the network. [code] is stable; switch on it, not on [message].
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.status,
    this.details,
  });

  factory ApiException.fromDio(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final error = data['error'] as Map;
      return ApiException(
        code: error['code']?.toString() ?? 'UNKNOWN',
        message: error['message']?.toString() ?? 'Something went wrong',
        status: e.response?.statusCode,
        details: error['details'] is Map
            ? Map<String, dynamic>.from(error['details'] as Map)
            : null,
      );
    }
    return switch (e.type) {
      DioExceptionType.connectionTimeout ||
      DioExceptionType.sendTimeout ||
      DioExceptionType.receiveTimeout => const ApiException(
        code: networkTimeout,
        message: 'The request timed out',
      ),
      DioExceptionType.connectionError => const ApiException(
        code: networkError,
        message: 'No connection',
      ),
      _ => ApiException(
        code: 'UNKNOWN',
        message: 'Something went wrong',
        status: e.response?.statusCode,
      ),
    };
  }

  static const networkError = 'NETWORK_ERROR';
  static const networkTimeout = 'NETWORK_TIMEOUT';

  final String code;
  final String message;
  final int? status;
  final Map<String, dynamic>? details;

  bool get isNetwork => code == networkError || code == networkTimeout;

  int? get retryAfterSec => (details?['retryAfterSec'] as num?)?.toInt();
  int? get attemptsLeft => (details?['attemptsLeft'] as num?)?.toInt();

  /// Text to show the user.
  String get friendlyMessage {
    switch (code) {
      case 'OTP_INVALID':
        final left = attemptsLeft;
        return left == null
            ? 'That code isn’t right.'
            : 'That code isn’t right. $left ${left == 1 ? 'try' : 'tries'} left.';
      case 'OTP_COOLDOWN':
        return 'Please wait ${retryAfterSec ?? 30}s before asking for a new code.';
      case 'OTP_RATE_LIMITED':
        final minutes = ((retryAfterSec ?? 3600) / 60).ceil();
        return 'Too many attempts. Try again in about $minutes min.';
      default:
        return _messages[code] ?? message;
    }
  }

  static const _messages = {
    'PHONE_INVALID': 'Enter a valid 10-digit Indian mobile number.',
    'OTP_EXPIRED': 'This code has expired. Ask for a new one.',
    'OTP_TOO_MANY_ATTEMPTS': 'Too many wrong codes. Ask for a new one.',
    'OTP_DELIVERY_FAILED': 'We couldn’t send the code. Please try again.',
    'EMAIL_IN_USE': 'This email is already used by another account.',
    'ACCOUNT_SUSPENDED': 'Your account is suspended. Contact support.',
    'TOKEN_INVALID': 'Your session ended. Please sign in again.',
    'TOKEN_EXPIRED': 'Your session ended. Please sign in again.',
    'REFRESH_REUSED': 'For your security, please sign in again.',
    'VALIDATION_FAILED': 'Please check what you entered.',
    networkError: 'Can’t reach Sajha. Check your internet connection.',
    networkTimeout: 'Sajha is taking too long to respond. Please try again.',
  };

  @override
  String toString() => 'ApiException($code, $status): $message';
}
