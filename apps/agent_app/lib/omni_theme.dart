import 'package:flutter/material.dart';

class OmniColors {
  OmniColors._();

  static const warmCanvas = Color(0xFFFFF8F0);
  static const softSurface = Color(0xFFFFFDFC);
  static const apricot = Color(0xFFF3A683);
  static const sage = Color(0xFFAFC8A8);
  static const milkTea = Color(0xFFEADBC8);
  static const cocoa = Color(0xFF443A36);
  static const mutedCocoa = Color(0xFF756964);
}

class OmniTheme {
  OmniTheme._();

  static ThemeData get light {
    final colorScheme =
        ColorScheme.fromSeed(seedColor: OmniColors.apricot).copyWith(
      primary: OmniColors.apricot,
      onPrimary: OmniColors.cocoa,
      secondary: OmniColors.sage,
      onSecondary: OmniColors.cocoa,
      surface: OmniColors.softSurface,
      onSurface: OmniColors.cocoa,
      outline: OmniColors.milkTea,
    );
    final textTheme = ThemeData.light().textTheme.apply(
          bodyColor: OmniColors.cocoa,
          displayColor: OmniColors.cocoa,
        );

    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: OmniColors.warmCanvas,
      cardColor: OmniColors.softSurface,
      dividerColor: OmniColors.milkTea,
      textTheme: textTheme,
      appBarTheme: const AppBarTheme(
        backgroundColor: OmniColors.warmCanvas,
        foregroundColor: OmniColors.cocoa,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: OmniColors.softSurface,
        labelStyle: const TextStyle(color: OmniColors.mutedCocoa),
        hintStyle: const TextStyle(color: OmniColors.mutedCocoa),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: OmniColors.milkTea),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: OmniColors.milkTea),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide:
              const BorderSide(color: OmniColors.apricot, width: 2),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: OmniColors.apricot,
          foregroundColor: OmniColors.cocoa,
          minimumSize: const Size(48, 48),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: OmniColors.cocoa),
      ),
    );
  }
}
