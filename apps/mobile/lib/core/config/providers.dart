import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_config.dart';

/// Overridden in tests; defaults to the values compiled into the build.
final appConfigProvider = Provider<AppConfig>(
  (ref) => AppConfig.fromEnvironment(),
);
