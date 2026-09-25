import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';

/// Surface, 1 px border, radius 16, shadow-sm, padding 16 (DESIGN.md §7).
class SajhaCard extends StatelessWidget {
  const SajhaCard({
    super.key,
    required this.child,
    this.onTap,
    this.padding = const EdgeInsets.all(SajhaSpacing.md),
  });

  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final t = SajhaTokens.of(context);
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(SajhaRadius.lg),
      side: BorderSide(color: t.border),
    );
    return DecoratedBox(
      decoration: ShapeDecoration(shape: shape, shadows: SajhaShadow.sm),
      child: Material(
        color: t.surface,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}
