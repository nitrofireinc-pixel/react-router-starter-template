# EFHS Band Calendar (Flutter)

Cross-platform calendar viewer for East Forsyth Band events. Uses the same
**Schedule Board** feed and track colors as the public website calendar.

## Features

- Pulls events from `https://efhsband.org/api/caldev/events` by default
- Track palette from `/api/caldev/tracks` (Games, Rehearsals, Meetings, Deadlines, Trips, Other)
- Event list + detail screens with color chips matching the web calendar
- Pull-to-refresh and offline cache of the last successful fetch
- Settings to change the source URL
- Help screen documenting the feed shape
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

Until Firebase is real, the placeholder project still builds, and revision-based local alerts still work after the worker is deployed.

## Build a sideload APK

```bash
cd mobile
flutter pub get
flutter build apk --release
# output: build/app/outputs/flutter-apk/app-release.apk
```

Copy the release APK to `assets/downloads/efhs-band-calendar.apk` for the unlisted download page.

Install with `adb install -r build/app/outputs/flutter-apk/app-release.apk`.

## Unlisted download (not in public nav)

Staff/testers: `https://efhsband.org/calendar-app.html`  
Direct APK: `https://efhsband.org/assets/downloads/efhs-band-calendar.apk`

The page is `noindex` and is not linked from the public site navigation. Super Admins also see a dashboard card in the CMS.

## Custom calendar feeds

Point **Settings → Schedule Board JSON URL** at any HTTPS endpoint that returns Schedule Board events (preferred) or the legacy production array shape. For push on a custom host, implement the same `/api/calendar-push-state` + optional FCM topic contract.
