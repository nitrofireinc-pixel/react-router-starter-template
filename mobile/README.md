# EFHS Band Calendar (Flutter)

Cross-platform calendar viewer for East Forsyth Band events.

## Features

- Pulls events from a configurable JSON source URL (default: `https://efhsband.org/api/events`)
- Event list + detail screens
- Pull-to-refresh and offline cache of the last successful fetch
- Settings to change the source URL
- Help screen documenting the expected feed shape
- Push notifications when CMS calendar entries are **created** or **updated** (and deleted)

## Push notifications

Two layers work together:

1. **Revision check** — the website exposes `GET /api/calendar-push-state`. The app checks this on launch/resume and shows a local notification when the revision advances.
2. **Firebase Cloud Messaging** — when Firebase + Cloudflare FCM secrets are configured, the worker sends a topic push to `efhs_calendar` immediately after an admin create/update/delete.

### Cloudflare secrets

Set one of:

- `FCM_SERVICE_ACCOUNT_JSON` — full Firebase service-account JSON (preferred, HTTP v1)
- `FCM_SERVER_KEY` — legacy FCM server key

Optional: `FCM_PROJECT_ID` if the service-account JSON omits `project_id`.

### Firebase app setup

1. Create a Firebase project and register Android package `org.efhsband.efhs_calendar`
2. Replace `android/app/google-services.json`
3. Run `flutterfire configure` (or paste options into `lib/firebase_options.dart`)
4. Rebuild the APK

Until Firebase is real, the placeholder project still builds. The APK still:

- requests notification permission
- asks Android to ignore battery optimizations for background calendar checks
- polls `/api/calendar-push-state` about every 15 minutes via Workmanager (plus on open/resume)

Use **Settings → Allow background checks** after install so OEM battery policies do not block polling while the app is closed. Instant alerts still require Firebase + Cloudflare FCM secrets.

## Build a sideload APK

```bash
cd mobile
flutter pub get
flutter build apk --release --target-platform android-arm64
# output: build/app/outputs/flutter-apk/app-release.apk
# Published copy: /assets/downloads/EFHS-Band-Calendar.apk (arm64-v8a, Cloudflare Pages size limit)
```

Install with `adb install -r build/app/outputs/flutter-apk/app-release.apk`.

iOS / TestFlight can follow later with the same codebase once Apple signing is ready.

## Custom calendar feeds

Point **Settings → Events JSON URL** at any HTTPS endpoint that returns:

```json
[
  {
    "id": 1,
    "date_label": "Aug",
    "date_detail": "10",
    "event_year": 2026,
    "title": "Band Practice",
    "description": "4:15pm-6:30pm"
  }
]
```

HTML in `title` / `description` is stripped for display. For push on a custom host, implement the same `/api/calendar-push-state` + optional FCM topic contract.
