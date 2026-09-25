import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/observability/crash_reporting.dart';
import 'core/push/firebase_push_service.dart';
import 'core/push/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = AppConfig.fromEnvironment();
  // Push only when this build carries Firebase settings.
  final firebase = config.firebase;
  final push = firebase == null
      ? null
      : await FirebasePushService.start(firebase);
  // Crash reports only when it carries a Sentry DSN.
  await runWithCrashReporting(
    config,
    () => ProviderScope(
      overrides: [
        if (push != null) pushServiceProvider.overrideWithValue(push),
      ],
      child: const SajhaApp(),
    ),
  );
}
