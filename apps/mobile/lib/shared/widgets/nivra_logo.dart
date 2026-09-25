import 'package:flutter/material.dart';

import '../../core/theme/tokens.g.dart';

/// The Nivra app-icon tile (assets/brand/logo-mark.png, rendered from
/// packages/ui/brand/icon.svg).
class NivraMark extends StatelessWidget {
  const NivraMark({super.key, this.size = 36});

  final double size;

  static const asset = 'assets/brand/logo-mark.png';

  @override
  Widget build(BuildContext context) => Image.asset(
    asset,
    width: size,
    height: size,
    excludeFromSemantics: true,
    filterQuality: FilterQuality.medium,
  );
}

/// The horizontal logo: tile + "nivra" wordmark (DESIGN.md §2), optionally
/// with the "Borrow · Lend · Share" tagline. [inverse] is for dark
/// backgrounds (cream wordmark).
class NivraLogo extends StatelessWidget {
  const NivraLogo({
    super.key,
    this.size = 36,
    this.inverse,
    this.tagline = false,
  });

  final double size;

  /// Defaults to the theme: cream in dark mode, deep green in light.
  final bool? inverse;
  final bool tagline;

  static const green = Color(0xFF1E4D3A);
  static const cream = Color(0xFFFBF8F2);
  static const orange = Color(0xFFEC7A3A);

  @override
  Widget build(BuildContext context) {
    final onDark = inverse ?? Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: 'Nivra',
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          NivraMark(size: size),
          SizedBox(width: size * 0.3),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'nivra',
                style: TextStyle(
                  fontFamily: SajhaFonts.display,
                  fontWeight: FontWeight.w700,
                  fontSize: size * 0.72,
                  height: 1,
                  letterSpacing: size * 0.72 * -0.04,
                  color: onDark ? cream : green,
                ),
              ),
              if (tagline) ...[
                SizedBox(height: size * 0.12),
                Text(
                  'BORROW · LEND · SHARE',
                  style: TextStyle(
                    fontFamily: SajhaFonts.sans,
                    fontWeight: FontWeight.w600,
                    fontSize: size * 0.24,
                    letterSpacing: size * 0.24 * 0.3,
                    color: orange,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
