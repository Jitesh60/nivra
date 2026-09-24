import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/effects/motion.dart';
import '../../../core/effects/shader_background.dart';
import '../../../core/theme/tokens.g.dart';
import '../../auth/application/auth_controller.dart';

/// Shader background + animated wordmark while the stored session is checked.
/// The router moves on as soon as the auth state is known.
class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  /// Minimum time on screen so the intro animation can play.
  static const duration = Duration(milliseconds: 1600);

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _restore();
  }

  void _restore() => ref
      .read(authControllerProvider.notifier)
      .restore(minimumDuration: SplashScreen.duration);

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final error = auth is AuthUnknown ? auth.error : null;
    final text = Theme.of(context).textTheme;

    return Scaffold(
      body: ShaderBackground(
        child: SafeArea(
          child: Column(
            children: [
              const Spacer(),
              Text(
                'Sajha',
                style: text.displayMedium?.copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -1,
                ),
              ).animateIfAllowed(
                context,
                (a) => a
                    .fadeIn(duration: 600.ms)
                    .slideY(begin: 0.3, end: 0, curve: Curves.easeOutCubic)
                    .then()
                    .shimmer(duration: 1200.ms, color: SajhaColors.accent200),
              ),
              const SizedBox(height: SajhaSpacing.sm),
              Text(
                'Borrow what you need. Lend what you don’t use.',
                textAlign: TextAlign.center,
                style: text.bodyLarge?.copyWith(color: Colors.white70),
              ).animateIfAllowed(
                context,
                (a) => a.fadeIn(duration: 600.ms),
                delay: 400.ms,
              ),
              const Spacer(),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.all(SajhaSpacing.lg),
                  child: Column(
                    children: [
                      Text(
                        error.friendlyMessage,
                        textAlign: TextAlign.center,
                        style: text.bodyMedium?.copyWith(color: Colors.white),
                      ),
                      const SizedBox(height: SajhaSpacing.sm),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: const BorderSide(color: Colors.white54),
                        ),
                        onPressed: _restore,
                        child: const Text('Try again'),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
