import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/app.dart';
import 'package:sajha/core/network/api_client.dart';
import 'package:sajha/features/splash/presentation/splash_screen.dart';

void main() {
  testWidgets('shows the splash, then the welcome screen with API status', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [apiHealthyProvider.overrideWith((ref) async => true)],
        child: const SajhaApp(),
      ),
    );

    expect(find.text('Sajha'), findsOneWidget);

    // The shader background animates forever, so pump explicit durations
    // instead of pumpAndSettle.
    await tester.pump(SplashScreen.duration);
    await tester.pump(const Duration(seconds: 2));

    expect(find.text('Welcome to Sajha'), findsOneWidget);
    expect(find.text('API reachable'), findsOneWidget);
  });
}
