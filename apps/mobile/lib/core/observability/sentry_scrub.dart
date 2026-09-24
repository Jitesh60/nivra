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
  if (request != null) {
    event.request = SentryRequest(
      url: request.url == null ? null : scrubText(request.url!),
      method: request.method,
    );
  }
  final user = event.user;
  if (user != null) event.user = SentryUser(id: user.id);
  final message = event.message;
  if (message != null) {
    event.message = SentryMessage(scrubText(message.formatted));
  }
  for (final e in event.exceptions ?? const <SentryException>[]) {
    if (e.value != null) e.value = scrubText(e.value!);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).toList();
  return event;
}

Breadcrumb scrubBreadcrumb(Breadcrumb b) {
  if (b.message != null) b.message = scrubText(b.message!);
  b.data = b.data?.map((k, v) => MapEntry(k, v is String ? scrubText(v) : v));
  return b;
}
