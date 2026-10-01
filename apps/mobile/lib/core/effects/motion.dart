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

/// [children] fade and rise in one after another when they first appear
/// (a section that loads later animates in on its own). Kept short and small
/// so it reads as calm, and skipped under "reduce motion".
List<Widget> staggered(BuildContext context, List<Widget> children) {
  if (MediaQuery.disableAnimationsOf(context)) return children;
  return [
    for (final (i, child) in children.indexed)
      child
          .animate(
            key: ValueKey(child.key ?? '$i-${child.runtimeType}'),
            delay: Duration(milliseconds: 40 * (i < 8 ? i : 8)),
          )
          .fadeIn(duration: 280.ms)
          .slideY(begin: 0.06, end: 0, curve: Curves.easeOut),
  ];
}
