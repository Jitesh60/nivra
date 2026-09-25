import 'package:flutter/material.dart';

import '../../shared/widgets/sajha_button.dart';

/// The main call to action on a phone screen: a 52 px `glow` [SajhaButton]
/// (DESIGN.md §7). Kept for its existing call sites.
class GradientButton extends StatelessWidget {
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
  Widget build(BuildContext context) =>
      SajhaButton.glow(label: label, onPressed: onPressed, loading: loading);
}
