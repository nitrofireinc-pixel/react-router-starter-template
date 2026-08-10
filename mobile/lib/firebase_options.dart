// Replace these values with `flutterfire configure` output before shipping
// a release APK that needs real Firebase Cloud Messaging delivery.
//
// Until then the app still:
// 1) polls /api/calendar-push-state for local notifications on resume, and
// 2) registers for FCM when a real Firebase project is wired up.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static bool get isConfigured {
    final options = currentPlatform;
    return options.apiKey != 'REPLACE_ME'
        && options.projectId != 'efhs-calendar-placeholder'
        && options.messagingSenderId != '000000000000';
  }

  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Web is not a target for efhs_calendar v1.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        return ios;
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'REPLACE_ME',
    appId: '1:000000000000:android:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: 'efhs-calendar-placeholder',
    storageBucket: 'efhs-calendar-placeholder.appspot.com',
  );

  static const FirebaseOptions ios = FirebaseOptions(
    apiKey: 'REPLACE_ME',
    appId: '1:000000000000:ios:0000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: 'efhs-calendar-placeholder',
    storageBucket: 'efhs-calendar-placeholder.appspot.com',
    iosBundleId: 'org.efhsband.efhsCalendar',
  );
}
