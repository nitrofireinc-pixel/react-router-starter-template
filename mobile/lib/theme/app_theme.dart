import 'package:flutter/material.dart';

class AppTheme {
  static const navy = Color(0xFF002142);
  static const steel = Color(0xFF1F4E79);
  static const sky = Color(0xFFD7E6F4);
  static const ink = Color(0xFF132033);
  static const paper = Color(0xFFF3F7FB);

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: navy,
        primary: navy,
        secondary: steel,
        surface: Colors.white,
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: paper,
    );
    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: navy,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: navy,
        foregroundColor: Colors.white,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
      ),
      listTileTheme: const ListTileThemeData(
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),
    );
  }
}
