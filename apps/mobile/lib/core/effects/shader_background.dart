import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

import '../theme/tokens.g.dart';

/// Full-bleed animated GLSL background (shaders/aurora.frag).
///
/// Falls back to a static gradient while the shader loads, if it fails to
/// load, or when the user has asked the OS to reduce motion.
class ShaderBackground extends StatefulWidget {
  const ShaderBackground({
    super.key,
    this.child,
    this.colors = const [
      SajhaColors.brand950,
      SajhaColors.brand700,
      SajhaColors.accent500,
    ],
  }) : assert(colors.length == 3);

  final Widget? child;
  final List<Color> colors;

  static const asset = 'shaders/aurora.frag';

  @override
  State<ShaderBackground> createState() => _ShaderBackgroundState();
}

class _ShaderBackgroundState extends State<ShaderBackground>
    with SingleTickerProviderStateMixin {
  static Future<ui.FragmentProgram>? _program;

  ui.FragmentShader? _shader;
  late final Ticker _ticker = createTicker((elapsed) {
    setState(
      () => _seconds = elapsed.inMicroseconds / Duration.microsecondsPerSecond,
    );
  });
  double _seconds = 0;

  @override
  void initState() {
    super.initState();
    _program ??= ui.FragmentProgram.fromAsset(ShaderBackground.asset);
    _program!
        .then((program) {
          if (!mounted) return;
          setState(() => _shader = program.fragmentShader());
        })
        .catchError((Object _) {
          // Keep the gradient fallback.
          _program = null;
        });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduceMotion = MediaQuery.disableAnimationsOf(context);
    if (reduceMotion && _ticker.isActive) _ticker.stop();
    if (!reduceMotion && !_ticker.isActive) _ticker.start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _shader?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shader = _shader;
    return Stack(
      fit: StackFit.expand,
      children: [
        if (shader == null)
          DecoratedBox(
            key: const ValueKey('shader-fallback'),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: widget.colors,
              ),
            ),
          )
        else
          CustomPaint(
            key: const ValueKey('shader-canvas'),
            painter: _AuroraPainter(shader, _seconds, widget.colors),
          ),
        if (widget.child != null) widget.child!,
      ],
    );
  }
}

class _AuroraPainter extends CustomPainter {
  _AuroraPainter(this.shader, this.time, this.colors);

  final ui.FragmentShader shader;
  final double time;
  final List<Color> colors;

  @override
  void paint(Canvas canvas, Size size) {
    var i = 0;
    shader
      ..setFloat(i++, size.width)
      ..setFloat(i++, size.height)
      ..setFloat(i++, time);
    for (final c in colors) {
      shader
        ..setFloat(i++, c.r)
        ..setFloat(i++, c.g)
        ..setFloat(i++, c.b)
        ..setFloat(i++, c.a);
    }
    canvas.drawRect(Offset.zero & size, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(_AuroraPainter old) =>
      old.time != time || old.colors != colors;
}
