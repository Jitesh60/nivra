import 'package:flutter/material.dart';

import '../theme/tokens.g.dart';

/// Primary call-to-action: brand gradient that slowly shifts, with a press
/// scale — the native take on the uiverse.io buttons used on the website.
class GradientButton extends StatefulWidget {
  const GradientButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
  });

  final String label;

  /// Null disables the button.
  final VoidCallback? onPressed;
  final bool loading;

  @override
  State<GradientButton> createState() => _GradientButtonState();
}

class _GradientButtonState extends State<GradientButton>
    with SingleTickerProviderStateMixin {
  late final _shift = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 4),
  );
  bool _pressed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _shift.stop();
    } else if (!_shift.isAnimating) {
      _shift.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _shift.dispose();
    super.dispose();
  }

  bool get _enabled => widget.onPressed != null && !widget.loading;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      enabled: _enabled,
      label: widget.label,
      excludeSemantics: true,
      child: GestureDetector(
        onTapDown: _enabled ? (_) => setState(() => _pressed = true) : null,
        onTapCancel: () => setState(() => _pressed = false),
        onTapUp: _enabled ? (_) => setState(() => _pressed = false) : null,
        onTap: _enabled ? widget.onPressed : null,
        child: AnimatedScale(
          scale: _pressed ? 0.97 : 1,
          duration: const Duration(milliseconds: 120),
          child: AnimatedBuilder(
            animation: _shift,
            builder: (context, child) => AnimatedOpacity(
              opacity: widget.onPressed == null ? 0.45 : 1,
              duration: const Duration(milliseconds: 200),
              child: Container(
                height: 56,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(SajhaRadius.lg),
                  gradient: LinearGradient(
                    begin: Alignment(-1 + _shift.value, -1),
                    end: Alignment(1 + _shift.value, 1),
                    colors: const [
                      SajhaColors.brand600,
                      SajhaColors.brand500,
                      SajhaColors.accent500,
                    ],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: SajhaColors.brand700.withValues(alpha: 0.35),
                      blurRadius: 18,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: child,
              ),
            ),
            child: widget.loading
                ? const SizedBox.square(
                    dimension: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : Text(
                    widget.label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}
