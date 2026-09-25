import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/observability/sentry_scrub.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  test('removes phone numbers, emails and codes from text', () {
    expect(
      scrubText('OTP for +919876543210 failed'),
      'OTP for [redacted] failed',
    );
    expect(
      scrubText('user 9876543210, rahul@example.com'),
      'user [redacted], [redacted]',
    );
    expect(
      scrubText('/v1/x?code=482913&page=2'),
      '/v1/x?code=[redacted]&page=2',
    );
    expect(scrubText('booking 01a0d4b3 ₹1,300'), 'booking 01a0d4b3 ₹1,300');
  });

  test('keeps only the user id and drops request bodies and headers', () {
    final event = scrubEvent(
      SentryEvent(
        message: SentryMessage('No user rahul@example.com'),
        user: SentryUser(
          id: 'u1',
          email: 'rahul@example.com',
          ipAddress: '1.2.3.4',
        ),
        request: SentryRequest(
          url: 'https://api.sajha.app/v1/auth/otp/verify?code=123456',
          method: 'POST',
          data: {'phone': '+919876543210'},
          headers: {'Authorization': 'Bearer abc'},
        ),
        exceptions: [
          SentryException(type: 'ApiException', value: 'For 9876543210'),
        ],
        breadcrumbs: [
          Breadcrumb(
            message: 'Opened chat with 9876543210',
            data: {'to': '/x?otp=1'},
          ),
        ],
      ),
    );
    expect(event.user?.id, 'u1');
    expect(event.user?.email, isNull);
    expect(event.user?.ipAddress, isNull);
    expect(event.request?.data, isNull);
    expect(event.request?.headers, isEmpty);
    expect(
      event.request?.url,
      'https://api.sajha.app/v1/auth/otp/verify?code=[redacted]',
    );
    expect(event.message?.formatted, 'No user [redacted]');
    expect(event.exceptions?.single.value, 'For [redacted]');
    expect(event.breadcrumbs?.single.message, 'Opened chat with [redacted]');
    expect(event.breadcrumbs?.single.data, {'to': '/x?otp=[redacted]'});
  });
}
