import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';
import 'dots_loader.dart';

enum SajhaButtonVariant { primary, glow, secondary, outline, ghost, danger }

enum SajhaButtonSize { sm, md, lg }

/// The Nivra button (DESIGN.md §7): a pill in three heights (36/44/52), the
/// same variants as `@sajha/ui` on the web and admin panel.
///
/// `glow` is the hero call to action: ink-950 with an animated brand→accent
/// gradient border, the native take on the website's Uiverse button.
class SajhaButton extends StatelessWidget {
  const SajhaButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = SajhaButtonVariant.primary,
    this.size = SajhaButtonSize.md,
    this.icon,
    this.loading = false,
    this.expand = true,
  });

  const SajhaButton.glow({
    super.key,
    required this.label,
    required this.onPressed,
    this.size = SajhaButtonSize.lg,
    this.icon,
    this.loading = false,
    this.expand = true,
  }) : variant = SajhaButtonVariant.glow;

  final String label;

  /// Null disables the button.
  final VoidCallback? onPressed;
  final SajhaButtonVariant variant;
  final SajhaButtonSize size;
  final IconData? icon;
  final bool loading;

  /// Fill the available width (the default on phones).
  final bool expand;

  double get _height => switch (size) {
    SajhaButtonSize.sm => SajhaSize.controlSm,
    SajhaButtonSize.md => SajhaSize.controlMd,
    SajhaButtonSize.lg => SajhaSize.controlLg,
  };

  @override
  Widget build(BuildContext context) {
    final t = SajhaTokens.of(context);
    final (bg, fg, border) = switch (variant) {
      SajhaButtonVariant.primary => (t.primary, t.onPrimary, null),
      SajhaButtonVariant.glow => (SajhaColors.ink950, Colors.white, null),
      SajhaButtonVariant.secondary => (t.primarySoft, t.onPrimarySoft, null),
      SajhaButtonVariant.outline => (
        Colors.transparent,
        t.foreground,
        t.border,
      ),
      SajhaButtonVariant.ghost => (Colors.transparent, t.foreground, null),
      SajhaButtonVariant.danger => (t.danger, t.onDanger, null),
    };
    final textStyle =
        (size == SajhaButtonSize.sm
                ? SajhaType.small.copyWith(fontWeight: FontWeight.w600)
                : SajhaType.button)
            .copyWith(color: fg);
    final iconSize = size == SajhaButtonSize.sm
        ? SajhaSize.iconSm
        : SajhaSize.iconMd;
    final enabled = onPressed != null && !loading;

    Widget content = Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[
          Icon(icon, size: iconSize, color: fg),
          const SizedBox(width: 8),
        ],
        Flexible(
          child: Text(label, style: textStyle, overflow: TextOverflow.ellipsis),
        ),
      ],
    );
    if (loading) {
      // Keep the width; swap the label for dots.
      content = Stack(
        alignment: Alignment.center,
        children: [
          Opacity(opacity: 0, child: content),
          DotsLoader(color: fg, label: label),
        ],
      );
    }

    final padding = EdgeInsets.symmetric(
      horizontal: switch (size) {
        SajhaButtonSize.sm => 16,
        SajhaButtonSize.md => 20,
        SajhaButtonSize.lg => 24,
      },
    );

    Widget button = Material(
      color: bg,
      shape: StadiumBorder(
        side: border == null ? BorderSide.none : BorderSide(color: border),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: enabled ? onPressed : null,
        child: Container(
          height: _height,
          padding: padding,
          alignment: Alignment.center,
          child: content,
        ),
      ),
    );

    if (variant == SajhaButtonVariant.glow) {
      button = _GlowBorder(child: button);
    } else if (variant == SajhaButtonVariant.primary && enabled) {
      button = DecoratedBox(
        decoration: const ShapeDecoration(
          shape: StadiumBorder(),
          shadows: SajhaShadow.xs,
        ),
        child: button,
      );
    }

    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      excludeSemantics: true,
      child: AnimatedOpacity(
        opacity: onPressed == null ? 0.5 : 1,
        duration: SajhaMotion.base,
        child: SizedBox(width: expand ? double.infinity : null, child: button),
      ),
    );
  }
}

/// A 2 px rotating sweep-gradient ring around a pill (the web `.sj-glow-border`).
class _GlowBorder extends StatefulWidget {
  const _GlowBorder({required this.child});

  final Widget child;

  @override
  State<_GlowBorder> createState() => _GlowBorderState();
}

class _GlowBorderState extends State<_GlowBorder>
    with SingleTickerProviderStateMixin {
  late final _spin = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 4),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _spin.stop();
    } else if (!_spin.isAnimating) {
      _spin.repeat();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _RingPainter(_spin),
      child: Padding(padding: const EdgeInsets.all(2), child: widget.child),
    );
  }
}

class _RingPainter extends CustomPainter {
  _RingPainter(this.spin) : super(repaint: spin);

  final Animation<double> spin;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final rrect = RRect.fromRectAndRadius(rect, Radius.circular(size.height));
    final paint = Paint()
      ..shader = SweepGradient(
        colors: const [
          SajhaColors.brand400,
          SajhaColors.accent400,
          SajhaColors.brand300,
          SajhaColors.accent500,
          SajhaColors.brand400,
        ],
        transform: GradientRotation(spin.value * 2 * math.pi),
      ).createShader(rect);
    canvas.drawRRect(rrect, paint);
  }

  @override
  bool shouldRepaint(_RingPainter oldDelegate) => false;
}
