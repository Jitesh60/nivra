import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/providers.dart';
import '../../../core/network/api_client.dart';
import '../../../core/theme/tokens.g.dart';

/// Phase 0 placeholder shown after the splash. Replaced by onboarding
/// and phone login in Phase 1b. Shows whether the app can reach the API.
class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final config = ref.watch(appConfigProvider);
    final health = ref.watch(apiHealthyProvider);
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SajhaSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              Text('Welcome to Sajha', style: text.headlineMedium),
              const SizedBox(height: SajhaSpacing.sm),
              Text(
                'Onboarding and sign-in arrive in Phase 1b.',
                style: text.bodyLarge,
              ),
              const Spacer(),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: switch (health) {
                  AsyncData(value: true) => const Icon(
                    Icons.check_circle,
                    color: SajhaColors.success,
                  ),
                  AsyncData() || AsyncError() => const Icon(
                    Icons.error,
                    color: SajhaColors.danger,
                  ),
                  _ => const SizedBox.square(
                    dimension: 24,
                    child: CircularProgressIndicator(),
                  ),
                },
                title: Text(switch (health) {
                  AsyncData(value: true) => 'API reachable',
                  AsyncData() || AsyncError() => 'API unreachable',
                  _ => 'Checking API…',
                }),
                subtitle: Text('${config.env.name} · ${config.apiBaseUrl}'),
                trailing: IconButton(
                  tooltip: 'Retry',
                  icon: const Icon(Icons.refresh),
                  onPressed: () => ref.invalidate(apiHealthyProvider),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
