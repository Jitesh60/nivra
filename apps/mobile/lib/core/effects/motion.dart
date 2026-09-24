import 'package:flutter/widgets.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Honours the OS "reduce motion" setting for flutter_animate effects.
extension ReducedMotion on Widget {
  /// Like `.animate()`, but returns the widget unchanged when the user has
  /// asked the OS to reduce motion.
  Widget animateIfAllowed(
    BuildContext context,
    Animate Function(Animate animate) build, {
    Duration? delay,
  }) {
    if (MediaQuery.disableAnimationsOf(context)) return this;
    return build(animate(delay: delay));
  }
}
