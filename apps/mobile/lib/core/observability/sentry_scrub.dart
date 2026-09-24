import 'package:sentry_flutter/sentry_flutter.dart';

final _phone = RegExp(r'(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)');
final _email = RegExp(
  r'[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}',
  caseSensitive: false,
);
final _secretParam = RegExp(
  r'([?&](?:code|token|otp|signature|key)=)[^&#]*',
  caseSensitive: false,
);
const _redacted = '[redacted]';

/// Replaces phone numbers, emails and secret query values in free text.
String scrubText(String text) => text
    .replaceAll(_email, _redacted)
    .replaceAll(_phone, _redacted)
    .replaceAllMapped(_secretParam, (m) => '${m[1]}$_redacted');

/// Drops personal data before a crash report leaves the phone: request
/// bodies and headers, everything about the user but their id, and phone
/// numbers, emails and codes in messages, exceptions and breadcrumbs.
SentryEvent scrubEvent(SentryEvent event) {
  final request = event.request;
  final user = event.user;
  return event.copyWith(
    request: request == null
        ? null
        : SentryRequest(
            url: request.url == null ? null : scrubText(request.url!),
            method: request.method,
          ),
    user: user == null ? null : SentryUser(id: user.id),
    message: event.message == null
        ? null
        : SentryMessage(scrubText(event.message!.formatted)),
    exceptions: event.exceptions
        ?.map(
          (e) =>
              e.copyWith(value: e.value == null ? null : scrubText(e.value!)),
        )
        .toList(),
    breadcrumbs: event.breadcrumbs?.map(scrubBreadcrumb).toList(),
  );
}

Breadcrumb scrubBreadcrumb(Breadcrumb b) => b.copyWith(
  message: b.message == null ? null : scrubText(b.message!),
  data: b.data?.map((k, v) => MapEntry(k, v is String ? scrubText(v) : v)),
);
