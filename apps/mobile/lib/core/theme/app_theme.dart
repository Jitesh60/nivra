import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Material theme built from the shared design tokens (packages/design-tokens).
abstract final class AppTheme {
  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: SajhaColors.brand600,
      primary: SajhaColors.brand700,
      secondary: SajhaColors.accent500,
      error: SajhaColors.danger,
      surface: Colors.white,
    );
    return _base(scheme);
  }

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: SajhaColors.brand600,
      brightness: Brightness.dark,
      primary: SajhaColors.brand400,
      secondary: SajhaColors.accent400,
      error: SajhaColors.danger,
      surface: SajhaColors.ink950,
    );
    return _base(scheme);
  }

  static ThemeData _base(ColorScheme scheme) => ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(SajhaRadius.lg),
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(SajhaRadius.md),
      ),
    ),
  );
}
