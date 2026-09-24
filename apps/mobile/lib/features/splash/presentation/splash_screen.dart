import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';

import '../../../core/effects/shader_background.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';

/// Phase 0 splash: shader background + animated wordmark, then moves on.
/// Phase 1b adds the stored-session check here.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  static const duration = Duration(milliseconds: 2200);

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    Future<void>.delayed(SplashScreen.duration, () {
      if (mounted) context.go(Routes.welcome);
    });
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: ShaderBackground(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                    'Sajha',
                    style: text.displayMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -1,
                    ),
                  )
                  .animate()
                  .fadeIn(duration: 600.ms)
                  .slideY(begin: 0.3, end: 0, curve: Curves.easeOutCubic)
                  .then()
                  .shimmer(duration: 1200.ms, color: SajhaColors.accent200),
              const SizedBox(height: SajhaSpacing.sm),
              Text(
                'Borrow what you need. Lend what you don’t use.',
                textAlign: TextAlign.center,
                style: text.bodyLarge?.copyWith(color: Colors.white70),
              ).animate(delay: 400.ms).fadeIn(duration: 600.ms),
            ],
          ),
        ),
      ),
    );
  }
}
