import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';

enum SajhaBadgeTone { neutral, brand, success, warning, danger, info, accent }

/// A tinted pill in caption type (DESIGN.md §7): the tone at 12%, the text
/// mixed toward the foreground so it reads in light and dark.
class SajhaBadge extends StatelessWidget {
  const SajhaBadge(
    this.label, {
    super.key,
    this.tone = SajhaBadgeTone.brand,
    this.icon,
  });

  final String label;
  final SajhaBadgeTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = SajhaTokens.of(context);
    final (Color bg, Color fg) = switch (tone) {
      SajhaBadgeTone.neutral => (t.surfaceMuted, t.foreground),
      SajhaBadgeTone.brand => (t.primarySoft, t.onPrimarySoft),
      SajhaBadgeTone.success => _tint(t.success, t.foreground),
      SajhaBadgeTone.warning => _tint(t.warning, t.foreground),
      SajhaBadgeTone.danger => _tint(t.danger, t.foreground),
      SajhaBadgeTone.info => _tint(t.info, t.foreground),
      SajhaBadgeTone.accent => _tint(t.accent, t.foreground),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: ShapeDecoration(color: bg, shape: const StadiumBorder()),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: SajhaType.caption.copyWith(
              color: fg,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  static (Color, Color) _tint(Color tone, Color foreground) =>
      (tone.withValues(alpha: 0.12), Color.lerp(tone, foreground, 0.38)!);
}
