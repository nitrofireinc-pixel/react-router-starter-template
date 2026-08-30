import 'package:flutter/material.dart';

import '../services/push_service.dart';
import '../services/settings_store.dart';
import '../theme/app_theme.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Help')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 36),
        children: [
          Text(
            'East Forsyth Band Calendar',
            style: textTheme.headlineSmall?.copyWith(
              color: AppTheme.navy,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'This app reads the public Schedule Board feed used by the website calendar, including the same track colors (Games, Rehearsals, Meetings, Deadlines, Trips, Other).',
            style: textTheme.bodyLarge?.copyWith(height: 1.4),
          ),
          const SizedBox(height: 24),
          _section(
            context,
            title: 'Default source',
            body: SettingsStore.defaultSourceUrl,
          ),
          _section(
            context,
            title: 'Expected endpoint',
            body:
                'GET a URL that returns application/json. The body must be a JSON array of event objects (Schedule Board or legacy production shape).',
          ),
          _section(
            context,
            title: 'Schedule Board event shape',
            body: '''
{
  "id": 12,
  "title": "Band Practice",
  "description": "Bring water",
  "location": "Band room",
  "who": "Full band",
  "start_date": "2026-08-10",
  "end_date": "",
  "start_time": "16:15",
  "end_time": "18:30",
  "track": "rehearsal",
  "all_day": 0
}
'''.trim(),
            mono: true,
          ),
          _section(
            context,
            title: 'Track colors',
            body:
                'Games #E71321 · Rehearsals #014990 · Meetings #002142 · '
                'Deadlines #FDD703 · Trips #7c3aed · Other #5b6472\n'
                'The app also loads /api/caldev/tracks so palette changes on the site apply without rebuilding.',
          ),
          _section(
            context,
            title: 'HTML in titles/descriptions',
            body:
                'HTML tags are allowed (the site stores rich text). The app strips tags for display.',
          ),
          _section(
            context,
            title: 'East Forsyth endpoints',
            body:
                'Schedule Board events: https://efhsband.org/api/caldev/events\n'
                'Track palette: https://efhsband.org/api/caldev/tracks\n'
                'Legacy upcoming events: https://efhsband.org/api/events\n'
                'Push revision state: https://efhsband.org/api/calendar-push-state',
          ),
          _section(
            context,
            title: 'Push notifications',
            body:
                'When a CMS editor adds or updates a calendar event, the site bumps '
                '/api/calendar-push-state and (when Firebase is configured) sends an FCM '
                'message to topic "${PushService.topic}".\n\n'
                'In Settings you can turn notifications on/off. The app also checks the '
                'revision when you reopen it, so you still get an alert even before FCM '
                'credentials are installed.\n\n'
                'To enable true background push:\n'
                '1. Create a Firebase project and add Android/iOS apps for org.efhsband.efhs_calendar\n'
                '2. Replace android/app/google-services.json and lib/firebase_options.dart\n'
                '3. Set Cloudflare secret FCM_SERVICE_ACCOUNT_JSON (or FCM_SERVER_KEY)\n'
                '4. Rebuild/sideload the APK',
          ),
          _section(
            context,
            title: 'Sideload download',
            body:
                'Staff can install the Android APK from the unlisted page '
                'https://efhsband.org/calendar-app.html (not linked in public navigation).',
          ),
          _section(
            context,
            title: 'Build a sideload APK',
            body:
                'cd mobile\n'
                'flutter pub get\n'
                'flutter build apk --release\n'
                '# APK: build/app/outputs/flutter-apk/app-release.apk',
            mono: true,
          ),
        ],
      ),
    );
  }

  Widget _section(
    BuildContext context, {
    required String title,
    required String body,
    bool mono = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: AppTheme.navy,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: mono ? const EdgeInsets.all(12) : EdgeInsets.zero,
            decoration: mono
                ? BoxDecoration(
                    color: const Color(0xFFEFF4F9),
                    borderRadius: BorderRadius.circular(12),
                  )
                : null,
            child: Text(
              body,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    height: 1.4,
                    fontFamily: mono ? 'monospace' : null,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
