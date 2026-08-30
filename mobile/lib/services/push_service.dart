import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../firebase_options.dart';
import 'event_repository.dart';
import 'settings_store.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background display is handled by the OS notification payload from FCM.
}

class PushService {
  PushService(this._settings, this._repository);

  static const _channelId = 'efhs_calendar_updates';
  static const _channelName = 'Calendar updates';
  static const topic = 'efhs_calendar';

  final SettingsStore _settings;
  final EventRepository _repository;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  bool firebaseReady = false;
  String? lastToken;
  String? lastError;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _local.initialize(
      settings: const InitializationSettings(android: androidInit, iOS: iosInit),
    );
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(
          const AndroidNotificationChannel(
            _channelId,
            _channelName,
            description: 'Alerts when band calendar events are added or updated.',
            importance: Importance.high,
          ),
        );

    if (!DefaultFirebaseOptions.isConfigured) {
      lastError =
          'Firebase is not configured yet. Local revision checks still work.';
      return;
    }

    try {
      await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      final messaging = FirebaseMessaging.instance;
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      FirebaseMessaging.onMessage.listen(_showRemoteMessage);
      firebaseReady = true;
    } catch (error) {
      lastError = 'Firebase init failed: $error';
      firebaseReady = false;
    }
  }

  Future<void> syncPermissionsAndRegistration() async {
    await init();
    if (!_settings.pushEnabled) {
      await _unsubscribe();
      return;
    }

    await _checkRevisionAndNotify();

    if (!firebaseReady) return;

    final messaging = FirebaseMessaging.instance;
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      lastError = 'Notification permission denied';
      return;
    }

    try {
      await messaging.subscribeToTopic(topic);
      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        lastToken = token;
        await _repository.registerPushToken(
          token: token,
          platform: _platformName(),
        );
      }
      messaging.onTokenRefresh.listen((token) async {
        lastToken = token;
        if (!_settings.pushEnabled) return;
        try {
          await _repository.registerPushToken(
            token: token,
            platform: _platformName(),
          );
        } catch (error) {
          lastError = error.toString();
        }
      });
      lastError = null;
    } catch (error) {
      lastError = error.toString();
    }
  }

  Future<void> setEnabled(bool enabled) async {
    await _settings.setPushEnabled(enabled);
    if (enabled) {
      await syncPermissionsAndRegistration();
    } else {
      await _unsubscribe();
    }
  }

  Future<void> checkForUpdatesOnResume() async {
    if (!_settings.pushEnabled) return;
    await _checkRevisionAndNotify();
  }

  Future<void> _checkRevisionAndNotify() async {
    try {
      final state = await _repository.fetchPushState();
      if (state == null || state.revision <= 0) return;
      final last = _settings.lastPushRevision;
      if (last <= 0) {
        await _settings.setLastPushRevision(state.revision);
        return;
      }
      if (state.revision <= last) return;
      await _settings.setLastPushRevision(state.revision);
      await showLocalNotification(
        title: state.notificationTitle,
        body: state.notificationBody,
        payload: state.eventId?.toString(),
      );
    } catch (error) {
      lastError = error.toString();
    }
  }

  Future<void> showLocalNotification({
    required String title,
    required String body,
    String? payload,
  }) async {
    await _local.show(
      id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: title,
      body: body,
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          _channelName,
          channelDescription:
              'Alerts when band calendar events are added or updated.',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: payload,
    );
  }

  Future<void> _showRemoteMessage(RemoteMessage message) async {
    final notification = message.notification;
    final title = notification?.title ??
        _titleForAction(message.data['action']) ??
        'Calendar update';
    final body = notification?.body ??
        message.data['title'] ??
        'The band calendar changed.';
    final revision = int.tryParse(message.data['revision'] ?? '');
    if (revision != null && revision > _settings.lastPushRevision) {
      await _settings.setLastPushRevision(revision);
    }
    await showLocalNotification(
      title: title,
      body: body,
      payload: message.data['event_id'],
    );
  }

  Future<void> _unsubscribe() async {
    if (!firebaseReady) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.unsubscribeFromTopic(topic);
      final token = lastToken ?? await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        await _repository.unregisterPushToken(token);
      }
    } catch (error) {
      lastError = error.toString();
    }
  }

  String _platformName() {
    if (kIsWeb) return 'web';
    if (Platform.isIOS) return 'ios';
    return 'android';
  }

  String? _titleForAction(String? action) {
    switch (action) {
      case 'created':
        return 'New calendar event';
      case 'updated':
        return 'Calendar event updated';
      case 'deleted':
        return 'Calendar event removed';
      default:
        return null;
    }
  }
}
