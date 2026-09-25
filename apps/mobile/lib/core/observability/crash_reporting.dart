import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import '../config/app_config.dart';
import 'sentry_scrub.dart';

/// Runs the app, inside Sentry when this build has a DSN. Personal data is
/// scrubbed on the phone before anything is sent; no screenshots or view
/// hierarchies are attached.
Future<void> runWithCrashReporting(
  AppConfig config,
  Widget Function() app,
) async {
  final dsn = config.sentryDsn;
  if (dsn == null) {
    runApp(app());
    return;
  }
  await SentryFlutter.init(
    (o) => o
      ..dsn = dsn
      ..environment = config.env.name
      ..sendDefaultPii = false
      ..attachScreenshot = false
      ..tracesSampleRate = 0
      ..beforeSend = ((event, hint) => scrubEvent(event))
      ..beforeBreadcrumb = ((crumb, hint) =>
          crumb == null ? null : scrubBreadcrumb(crumb)),
    appRunner: () => runApp(app()),
  );
}

/// Ties crash reports to a signed-in user by id only (never phone or email).
void identifyForCrashes(String? userId) {
  if (!Sentry.isEnabled) return;
  Sentry.configureScope(
    (scope) => scope.setUser(userId == null ? null : SentryUser(id: userId)),
  );
}
