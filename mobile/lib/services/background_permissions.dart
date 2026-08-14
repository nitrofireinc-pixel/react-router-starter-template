import 'dart:io';

import 'package:flutter/services.dart';

/// Native helpers for Android background-notification permissions.
class BackgroundPermissions {
  BackgroundPermissions._();

  static const _channel = MethodChannel('org.efhsband.efhs_calendar/background');

  static Future<bool> isIgnoringBatteryOptimizations() async {
    if (!Platform.isAndroid) return true;
    try {
      final value = await _channel.invokeMethod<bool>('isIgnoringBatteryOptimizations');
      return value ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<bool> requestIgnoreBatteryOptimizations() async {
    if (!Platform.isAndroid) return true;
    try {
      final value =
          await _channel.invokeMethod<bool>('requestIgnoreBatteryOptimizations');
      return value ?? false;
    } catch (_) {
      return false;
    }
  }

  static Future<void> openAppNotificationSettings() async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<void>('openAppNotificationSettings');
    } catch (_) {}
  }
}
