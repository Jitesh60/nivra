import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/network/api_exception.dart';

DioException _response(int status, Map<String, dynamic> body) {
  final options = RequestOptions(path: '/x');
  return DioException.badResponse(
    statusCode: status,
    requestOptions: options,
    response: Response(requestOptions: options, statusCode: status, data: body),
  );
}

void main() {
  test('parses the API error shape', () {
    final e = ApiException.fromDio(
      _response(400, {
        'error': {
          'code': 'OTP_INVALID',
          'message': 'The code is incorrect',
          'details': {'attemptsLeft': 2},
        },
      }),
    );
    expect(e.code, 'OTP_INVALID');
    expect(e.status, 400);
    expect(e.attemptsLeft, 2);
    expect(e.friendlyMessage, 'That code isn’t right. 2 tries left.');
  });

  test('uses retryAfterSec in cooldown and rate-limit messages', () {
    final cooldown = ApiException.fromDio(
      _response(429, {
        'error': {
          'code': 'OTP_COOLDOWN',
          'message': 'wait',
          'details': {'retryAfterSec': 17},
        },
      }),
    );
    expect(cooldown.friendlyMessage, contains('17s'));

    final limited = ApiException.fromDio(
      _response(429, {
        'error': {
          'code': 'OTP_RATE_LIMITED',
          'message': 'slow down',
          'details': {'retryAfterSec': 600},
        },
      }),
    );
    expect(limited.friendlyMessage, contains('10 min'));
  });

  test('maps connection failures to a network error', () {
    final e = ApiException.fromDio(
      DioException.connectionError(
        requestOptions: RequestOptions(),
        reason: 'down',
      ),
    );
    expect(e.isNetwork, isTrue);
    expect(e.friendlyMessage, contains('internet'));
  });

  test('falls back to the server message for unknown codes', () {
    final e = ApiException.fromDio(
      _response(418, {
        'error': {'code': 'NEW_CODE', 'message': 'Something new'},
      }),
    );
    expect(e.friendlyMessage, 'Something new');
  });
}
