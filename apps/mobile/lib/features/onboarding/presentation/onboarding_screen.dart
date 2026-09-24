import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/effects/gradient_button.dart';
import '../../../core/effects/motion.dart';
import '../../../core/effects/shader_background.dart';
import '../../../core/theme/tokens.g.dart';
import '../../auth/application/auth_controller.dart';

class _Slide {
  const _Slide(this.icon, this.title, this.body);
  final IconData icon;
  final String title;
  final String body;
}

const _slides = [
  _Slide(
    Icons.hiking,
    'Borrow for a day, not forever',
    'Trekking shoes for one trek, a camera for one trip. Rent from people near you for a small price.',
  ),
  _Slide(
    Icons.volunteer_activism_outlined,
    'Earn from things you rarely use',
    'List what sits in your cupboard most of the year. You set the price, the dates and the deposit.',
  ),
  _Slide(
    Icons.verified_user_outlined,
    'Safe on both sides',
    'Verified phone and email, refundable deposits, documents when the lender needs them, and reviews.',
  ),
];

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pages = PageController();
  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _finish() =>
      ref.read(authControllerProvider.notifier).completeOnboarding();

  void _next() {
    if (_index == _slides.length - 1) return _finish();
    _pages.nextPage(
      duration: const Duration(milliseconds: 350),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final last = _index == _slides.length - 1;

    return Scaffold(
      body: ShaderBackground(
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.topRight,
                child: TextButton(
                  onPressed: _finish,
                  style: TextButton.styleFrom(foregroundColor: Colors.white),
                  child: const Text('Skip'),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _pages,
                  itemCount: _slides.length,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemBuilder: (context, i) {
                    final slide = _slides[i];
                    return Padding(
                      padding: const EdgeInsets.all(SajhaSpacing.xl),
                      child:
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                slide.icon,
                                size: 96,
                                color: Colors.white,
                              ).animateIfAllowed(
                                context,
                                (a) => a.scale(
                                  begin: const Offset(0.8, 0.8),
                                  duration: 500.ms,
                                  curve: Curves.easeOutBack,
                                ),
                              ),
                              const SizedBox(height: SajhaSpacing.xl),
                              Text(
                                slide.title,
                                textAlign: TextAlign.center,
                                style: text.headlineMedium?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: SajhaSpacing.md),
                              Text(
                                slide.body,
                                textAlign: TextAlign.center,
                                style: text.bodyLarge?.copyWith(
                                  color: Colors.white70,
                                ),
                              ),
                            ],
                          ).animateIfAllowed(
                            context,
                            (a) => a
                                .fadeIn(duration: 400.ms)
                                .slideX(begin: 0.08, end: 0),
                          ),
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _slides.length,
                  (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: i == _index ? 24 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: i == _index ? Colors.white : Colors.white38,
                      borderRadius: BorderRadius.circular(SajhaRadius.full),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(SajhaSpacing.lg),
                child: GradientButton(
                  label: last ? 'Get started' : 'Next',
                  onPressed: _next,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
