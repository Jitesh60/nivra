import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Material theme built from the shared design tokens (DESIGN.md), so the
/// app matches the website and the admin panel: the same fonts, colour
/// roles, 44 px pill buttons and inputs, radius-16 cards.
abstract final class AppTheme {
  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final light = brightness == Brightness.light;
    final t = light ? SajhaTokens.light : SajhaTokens.dark;
    final scheme = ColorScheme(
      brightness: brightness,
      primary: t.primary,
      onPrimary: t.onPrimary,
      primaryContainer: t.primarySoft,
      onPrimaryContainer: t.onPrimarySoft,
      secondary: t.accent,
      onSecondary: t.onAccent,
      secondaryContainer: t.surfaceMuted,
      onSecondaryContainer: t.foreground,
      tertiary: t.info,
      onTertiary: Colors.white,
      error: t.danger,
      onError: t.onDanger,
      surface: t.surface,
      onSurface: t.foreground,
      onSurfaceVariant: t.mutedForeground,
      surfaceContainerLowest: t.surface,
      surfaceContainerLow: t.background,
      surfaceContainer: t.background,
      surfaceContainerHigh: t.surfaceMuted,
      surfaceContainerHighest: t.surfaceMuted,
      outline: t.input,
      outlineVariant: t.border,
      shadow: SajhaColors.ink950,
      inverseSurface: t.foreground,
      onInverseSurface: t.background,
      inversePrimary: light ? SajhaColors.brand300 : SajhaColors.brand700,
    );

    final text = _textTheme(t.foreground, t.mutedForeground);
    const pill = StadiumBorder();
    const md = Size(64, SajhaSize.controlMd);
    final buttonText = WidgetStatePropertyAll(SajhaType.button);
    RoundedRectangleBorder rounded(double r, [BorderSide? side]) =>
        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(r),
          side: side ?? BorderSide.none,
        );
    OutlineInputBorder field(Color color, [double width = 1]) =>
        OutlineInputBorder(
          borderRadius: BorderRadius.circular(SajhaRadius.md),
          borderSide: BorderSide(color: color, width: width),
        );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      fontFamily: SajhaFonts.sans,
      textTheme: text,
      scaffoldBackgroundColor: t.background,
      canvasColor: t.background,
      dividerColor: t.border,
      extensions: [t],
      appBarTheme: AppBarTheme(
        backgroundColor: t.background,
        foregroundColor: t.foreground,
        surfaceTintColor: Colors.transparent,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: SajhaType.h2.copyWith(
          color: t.foreground,
          fontSize: 22,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: ButtonStyle(
          // Full width, as the app's screens were laid out for.
          minimumSize: const WidgetStatePropertyAll(
            Size.fromHeight(SajhaSize.controlMd),
          ),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 20),
          ),
          shape: const WidgetStatePropertyAll(pill),
          textStyle: buttonText,
          iconSize: const WidgetStatePropertyAll(SajhaSize.iconMd),
          elevation: const WidgetStatePropertyAll(0),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(md),
          padding: const WidgetStatePropertyAll(
            EdgeInsets.symmetric(horizontal: 20),
          ),
          shape: const WidgetStatePropertyAll(pill),
          textStyle: buttonText,
          iconSize: const WidgetStatePropertyAll(SajhaSize.iconMd),
          foregroundColor: WidgetStatePropertyAll(t.foreground),
          side: WidgetStatePropertyAll(BorderSide(color: t.border)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(48, 40)),
          shape: const WidgetStatePropertyAll(pill),
          textStyle: buttonText,
          iconSize: const WidgetStatePropertyAll(SajhaSize.iconMd),
          foregroundColor: WidgetStatePropertyAll(t.primary),
        ),
      ),
      iconButtonTheme: const IconButtonThemeData(
        style: ButtonStyle(iconSize: WidgetStatePropertyAll(SajhaSize.iconLg)),
      ),
      iconTheme: IconThemeData(color: t.foreground, size: SajhaSize.iconLg),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: t.surface,
        isDense: true,
        constraints: const BoxConstraints(minHeight: SajhaSize.controlMd),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 12,
        ),
        hintStyle: SajhaType.body.copyWith(color: t.mutedForeground),
        labelStyle: SajhaType.body.copyWith(color: t.mutedForeground),
        border: field(t.input),
        enabledBorder: field(t.input),
        focusedBorder: field(t.ring, 2),
        errorBorder: field(t.danger),
        focusedErrorBorder: field(t.danger, 2),
      ),
      cardTheme: CardThemeData(
        color: t.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: rounded(SajhaRadius.lg, BorderSide(color: t.border)),
      ),
      chipTheme: ChipThemeData(
        shape: StadiumBorder(side: BorderSide(color: t.border)),
        backgroundColor: t.surface,
        selectedColor: t.primarySoft,
        labelStyle: SajhaType.small.copyWith(
          color: t.foreground,
          fontWeight: FontWeight.w600,
        ),
        side: BorderSide(color: t.border),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: t.surface,
        surfaceTintColor: Colors.transparent,
        indicatorColor: t.primarySoft,
        indicatorShape: const StadiumBorder(),
        labelTextStyle: WidgetStatePropertyAll(
          SajhaType.caption.copyWith(color: t.foreground),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: t.foreground,
        contentTextStyle: SajhaType.small.copyWith(color: t.background),
        shape: rounded(SajhaRadius.md),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: t.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(
            top: Radius.circular(SajhaRadius.xl),
          ),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: t.surface,
        surfaceTintColor: Colors.transparent,
        shape: rounded(SajhaRadius.xl),
        titleTextStyle: SajhaType.h3.copyWith(color: t.foreground),
      ),
      listTileTheme: ListTileThemeData(
        iconColor: t.mutedForeground,
        titleTextStyle: SajhaType.body.copyWith(
          color: t.foreground,
          fontWeight: FontWeight.w500,
        ),
        subtitleTextStyle: SajhaType.small.copyWith(color: t.mutedForeground),
      ),
      dividerTheme: DividerThemeData(color: t.border, thickness: 1),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: t.primary),
    );
  }

  /// Material text roles mapped onto the DESIGN.md type scale.
  static TextTheme _textTheme(Color fg, Color muted) {
    TextStyle c(TextStyle s, [Color? color]) => s.copyWith(color: color ?? fg);
    return TextTheme(
      displayLarge: c(SajhaType.display.copyWith(fontSize: 48)),
      displayMedium: c(SajhaType.display),
      displaySmall: c(SajhaType.h1),
      headlineLarge: c(SajhaType.h1),
      headlineMedium: c(SajhaType.h2.copyWith(fontSize: 28)),
      headlineSmall: c(SajhaType.h2),
      titleLarge: c(SajhaType.h3),
      titleMedium: c(SajhaType.title),
      titleSmall: c(SajhaType.body.copyWith(fontWeight: FontWeight.w600)),
      bodyLarge: c(SajhaType.body.copyWith(fontSize: 16, height: 1.45)),
      bodyMedium: c(SajhaType.body),
      bodySmall: c(SajhaType.small, muted),
      labelLarge: c(SajhaType.button),
      labelMedium: c(SajhaType.caption.copyWith(fontSize: 13)),
      labelSmall: c(SajhaType.caption, muted),
    );
  }
}

/// The DESIGN.md colour roles and shadows that Material has no slot for.
/// Read with `SajhaTokens.of(context)`.
@immutable
class SajhaTokens extends ThemeExtension<SajhaTokens> {
  const SajhaTokens({
    required this.background,
    required this.surface,
    required this.surfaceMuted,
    required this.foreground,
    required this.mutedForeground,
    required this.border,
    required this.input,
    required this.ring,
    required this.primary,
    required this.primaryHover,
    required this.onPrimary,
    required this.primarySoft,
    required this.onPrimarySoft,
    required this.accent,
    required this.onAccent,
    required this.success,
    required this.warning,
    required this.danger,
    required this.onDanger,
    required this.info,
  });

  static const light = SajhaTokens(
    background: SajhaLight.background,
    surface: SajhaLight.surface,
    surfaceMuted: SajhaLight.surfaceMuted,
    foreground: SajhaLight.foreground,
    mutedForeground: SajhaLight.mutedForeground,
    border: SajhaLight.border,
    input: SajhaLight.input,
    ring: SajhaLight.ring,
    primary: SajhaLight.primary,
    primaryHover: SajhaLight.primaryHover,
    onPrimary: SajhaLight.onPrimary,
    primarySoft: SajhaLight.primarySoft,
    onPrimarySoft: SajhaLight.onPrimarySoft,
    accent: SajhaLight.accent,
    onAccent: SajhaLight.onAccent,
    success: SajhaLight.success,
    warning: SajhaLight.warning,
    danger: SajhaLight.danger,
    onDanger: SajhaLight.onDanger,
    info: SajhaLight.info,
  );

  static const dark = SajhaTokens(
    background: SajhaDark.background,
    surface: SajhaDark.surface,
    surfaceMuted: SajhaDark.surfaceMuted,
    foreground: SajhaDark.foreground,
    mutedForeground: SajhaDark.mutedForeground,
    border: SajhaDark.border,
    input: SajhaDark.input,
    ring: SajhaDark.ring,
    primary: SajhaDark.primary,
    primaryHover: SajhaDark.primaryHover,
    onPrimary: SajhaDark.onPrimary,
    primarySoft: SajhaDark.primarySoft,
    onPrimarySoft: SajhaDark.onPrimarySoft,
    accent: SajhaDark.accent,
    onAccent: SajhaDark.onAccent,
    success: SajhaDark.success,
    warning: SajhaDark.warning,
    danger: SajhaDark.danger,
    onDanger: SajhaDark.onDanger,
    info: SajhaDark.info,
  );

  static SajhaTokens of(BuildContext context) =>
      Theme.of(context).extension<SajhaTokens>() ??
      (Theme.of(context).brightness == Brightness.dark ? dark : light);

  final Color background;
  final Color surface;
  final Color surfaceMuted;
  final Color foreground;
  final Color mutedForeground;
  final Color border;
  final Color input;
  final Color ring;
  final Color primary;
  final Color primaryHover;
  final Color onPrimary;
  final Color primarySoft;
  final Color onPrimarySoft;
  final Color accent;
  final Color onAccent;
  final Color success;
  final Color warning;
  final Color danger;
  final Color onDanger;
  final Color info;

  @override
  SajhaTokens copyWith() => this;

  @override
  SajhaTokens lerp(SajhaTokens? other, double t) =>
      other == null || t < 0.5 ? this : other;
}
