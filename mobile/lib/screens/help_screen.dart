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
            'This app reads a public JSON calendar feed. By default it uses the East Forsyth Band site.',
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
                'GET a URL that returns application/json. The body must be a JSON array of event objects.',
          ),
          _section(
            context,
            title: 'Event object shape',
            body: '''
{
  "id": 40,
  "date_label": "Aug",
  "date_detail": "10",
  "event_year": 2026,
  "title": "Band Practice",
  "description": "4:15pm-6:30pm",
  "repeat_summary": "Repeats Mon, Tue, Thu",
  "occurrence_date": "2026-08-10",
  "is_occurrence": true
}
'''.trim(),
            mono: true,
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
                'Upcoming/expanded events: https://efhsband.org/api/events\n'
                'Full calendar (past + future): https://efhsband.org/api/calendar-events\n'
                'Push revision state: https://efhsband.org/api/calendar-push-state',
          ),
          _section(
            context,
            title: 'Push notifications',
            body:
                'When a CMS editor adds or updates a calendar event, the site bumps '
                '/api/calendar-push-state and (when Firebase is configured) sends an FCM '
                'message to topic "${PushService.topic}".\n\n'
                'This APK requests notification permission and Android battery-exemption '
                'permission so it can check the site in the background about every 15 minutes '
                'while closed (and again whenever you open it). Use Settings → Allow background checks '
                'if alerts only appear after opening the app.\n\n'
                'For instant background FCM push:\n'
                '1. Create a Firebase project and add Android/iOS apps for org.efhsband.efhs_calendar\n'
                '2. Replace android/app/google-services.json and lib/firebase_options.dart\n'
                '3. Set Cloudflare Pages secret FCM_SERVICE_ACCOUNT_JSON (or FCM_SERVER_KEY)\n'
                '4. Rebuild/sideload the APK'
          ),
          _section(
            context,
            title: 'Custom feeds',
            body:
                'Point Settings → Calendar source URL at any HTTPS endpoint that returns '
                'the same JSON array shape. Push alerts for custom feeds only fire if that '
                'host implements /api/calendar-push-state (and optionally FCM) the same way.',
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
