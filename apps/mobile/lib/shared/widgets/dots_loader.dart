import 'package:flutter/material.dart';

/// Three bouncing dots (DESIGN.md §7, the web DotsLoader). Static when the
/// OS asks to reduce motion.
class DotsLoader extends StatefulWidget {
  const DotsLoader({super.key, this.color, this.label = 'Loading'});

  final Color? color;
  final String label;

  @override
  State<DotsLoader> createState() => _DotsLoaderState();
}

class _DotsLoaderState extends State<DotsLoader>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? DefaultTextStyle.of(context).style.color;
    return Semantics(
      label: widget.label,
      liveRegion: true,
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < 3; i++)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Transform.translate(
                  offset: Offset(0, -4 * _bounce((_c.value - i * 0.16) % 1)),
                  child: Container(
                    width: 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static double _bounce(double t) =>
      t < 0.5 ? Curves.easeOut.transform(t * 2) * (1 - t * 2) * 2 : 0;
}
