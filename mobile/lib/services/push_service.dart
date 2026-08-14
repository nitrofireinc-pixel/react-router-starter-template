import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:workmanager/workmanager.dart';

import '../firebase_options.dart';
import 'background_permissions.dart';
import 'event_repository.dart';
import 'settings_store.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Background display is handled by the OS notification payload from FCM.
}

@pragma('vm:entry-point')
void calendarPushPollingCallback() {
  Workmanager().executeTask((task, inputData) async {
    WidgetsFlutterBinding.ensureInitialized();
    try {
      final settings = await SettingsStore.open();
      if (!settings.pushEnabled) return true;
      final repository = EventRepository(settings);
      final push = PushService(settings, repository);
      await push.initLocalNotificationsOnly();
      await push.ensureNotificationPermission();
      await push.checkForUpdatesOnResume();
      // Reschedule a follow-up one-off so OEM battery policies are less likely
      // to stall the periodic worker forever.
      await push.scheduleFollowUpPoll();
      return true;
    } catch (_) {
      return true;
    }
  });
}

class PushService {
  PushService(this._settings, this._repository);

  static const _channelId = 'efhs_calendar_updates';
  static const _channelName = 'Calendar updates';
  static const topic = 'efhs_calendar';
  static const pollTaskName = 'efhs_calendar_push_poll';
  static const pollUniqueName = 'efhs-calendar-push-poll';
  static const followUpTaskName = 'efhs_calendar_push_followup';
  static const followUpUniqueName = 'efhs-calendar-push-followup';
  static const pollInterval = Duration(minutes: 15);

  final SettingsStore _settings;
  final EventRepository _repository;
  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  bool _initialized = false;
  bool _localReady = false;
  bool firebaseReady = false;
  bool notificationsAllowed = false;
  bool batteryUnrestricted = false;
  String? lastToken;
  String? lastError;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    await initLocalNotificationsOnly();

    if (Platform.isAndroid) {
      await Workmanager().initialize(calendarPushPollingCallback);
      await _syncBackgroundPolling();
    }

    if (!DefaultFirebaseOptions.isConfigured) {
      lastError =
          'Background calendar checks are enabled about every 15 minutes. '
          'Allow notifications and disable battery optimization for this app '
          'so checks can run while it is closed. Instant push still needs Firebase.';
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

  Future<void> initLocalNotificationsOnly() async {
    if (_localReady) return;
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
    _localReady = true;
  }

  Future<bool> ensureNotificationPermission() async {
    await initLocalNotificationsOnly();
    if (Platform.isAndroid) {
      final android = _local.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      final granted = await android?.requestNotificationsPermission();
      notificationsAllowed = granted ?? true;
      return notificationsAllowed;
    }
    if (Platform.isIOS) {
      final ios = _local.resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin>();
      final granted = await ios?.requestPermissions(
        alert: true,
        badge: true,
        sound: true,
      );
      notificationsAllowed = granted ?? false;
      return notificationsAllowed;
    }
    notificationsAllowed = true;
    return true;
  }

  Future<bool> ensureBackgroundPermission({bool prompt = true}) async {
    if (!Platform.isAndroid) {
      batteryUnrestricted = true;
      return true;
    }
    batteryUnrestricted =
        await BackgroundPermissions.isIgnoringBatteryOptimizations();
    if (batteryUnrestricted || !prompt) return batteryUnrestricted;
    await BackgroundPermissions.requestIgnoreBatteryOptimizations();
    batteryUnrestricted =
        await BackgroundPermissions.isIgnoringBatteryOptimizations();
    return batteryUnrestricted;
  }

  Future<void> _syncBackgroundPolling() async {
    if (!Platform.isAndroid) return;
    if (!_settings.pushEnabled) {
      await Workmanager().cancelByUniqueName(pollUniqueName);
      await Workmanager().cancelByUniqueName(followUpUniqueName);
      return;
    }
    await Workmanager().registerPeriodicTask(
      pollUniqueName,
      pollTaskName,
      frequency: pollInterval,
      initialDelay: const Duration(minutes: 5),
      existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
      constraints: Constraints(networkType: NetworkType.connected),
      backoffPolicy: BackoffPolicy.linear,
      backoffPolicyDelay: const Duration(minutes: 5),
    );
    await scheduleFollowUpPoll(initialDelay: pollInterval);
  }

  Future<void> scheduleFollowUpPoll({
    Duration initialDelay = pollInterval,
  }) async {
    if (!Platform.isAndroid || !_settings.pushEnabled) return;
    await Workmanager().registerOneOffTask(
      followUpUniqueName,
      followUpTaskName,
      initialDelay: initialDelay,
      existingWorkPolicy: ExistingWorkPolicy.replace,
      constraints: Constraints(networkType: NetworkType.connected),
      backoffPolicy: BackoffPolicy.linear,
      backoffPolicyDelay: const Duration(minutes: 5),
    );
  }

  Future<void> syncPermissionsAndRegistration() async {
    await init();
    if (!_settings.pushEnabled) {
      await _unsubscribe();
      await _syncBackgroundPolling();
      return;
    }

    final allowed = await ensureNotificationPermission();
    if (!allowed) {
      lastError =
          'Notification permission is off. Enable notifications for EFHS Band Calendar in system settings.';
    }

    await ensureBackgroundPermission(prompt: true);
    if (Platform.isAndroid && !batteryUnrestricted) {
      lastError =
          'Background checks are limited by battery optimization. Tap “Allow background checks” in Settings so the app can look for calendar updates while closed.';
    }

    await _checkRevisionAndNotify();
    await _syncBackgroundPolling();

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
      if (allowed && batteryUnrestricted) {
        lastError = null;
      }
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
      await _syncBackgroundPolling();
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
    await initLocalNotificationsOnly();
    await ensureNotificationPermission();
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
