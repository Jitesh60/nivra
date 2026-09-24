import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/config/app_config.dart';
import 'core/push/firebase_push_service.dart';
import 'core/push/push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Push only when this build carries Firebase settings.
  final firebase = AppConfig.fromEnvironment().firebase;
  final push = firebase == null
      ? null
      : await FirebasePushService.start(firebase);
  runApp(
    ProviderScope(
      overrides: [
        if (push != null) pushServiceProvider.overrideWithValue(push),
      ],
      child: const SajhaApp(),
    ),
  );
}
