import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/chat/application/connection.dart';

class SajhaApp extends ConsumerWidget {
  const SajhaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    // Live chat updates and push registration follow the sign-in state.
    ref
      ..watch(realtimeConnectionProvider)
      ..watch(pushRegistrationProvider);
    return MaterialApp.router(
      title: 'Sajha',
      debugShowCheckedModeBanner: !config.isProd,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
