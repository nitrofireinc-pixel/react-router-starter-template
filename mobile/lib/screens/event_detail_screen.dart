import 'package:flutter/material.dart';

import '../models/calendar_event.dart';
import '../models/calendar_track.dart';
import '../theme/app_theme.dart';

class EventDetailScreen extends StatelessWidget {
  const EventDetailScreen({
    super.key,
    required this.event,
    this.track,
  });

  final CalendarEvent event;
  final CalendarTrack? track;

  @override
  Widget build(BuildContext context) {
    final resolved = track ?? event.track;
    return Scaffold(
      appBar: AppBar(title: const Text('Event')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: resolved.color,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                resolved.label,
                style: TextStyle(
                  color: resolved.foreground,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text(
            event.dateHeading,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: AppTheme.steel,
                  letterSpacing: 0.4,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 4),
          Text(
            event.timeLabel,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppTheme.steel,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 8),
          Text(
            event.titlePlain.isEmpty ? 'Untitled event' : event.titlePlain,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: AppTheme.ink,
                  fontWeight: FontWeight.w800,
                  height: 1.15,
                ),
          ),
          if (event.whoPlain.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Who: ${event.whoPlain}',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.steel,
                  ),
            ),
          ],
          if (event.locationPlain.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Where: ${event.locationPlain}',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.steel,
                  ),
            ),
          ],
          if (event.repeatSummary.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              event.repeatSummary,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: AppTheme.steel,
                  ),
            ),
          ],
          const SizedBox(height: 20),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              border: Border(
                left: BorderSide(color: resolved.color, width: 5),
                top: const BorderSide(color: Color(0xFFD5E0EC)),
                right: const BorderSide(color: Color(0xFFD5E0EC)),
                bottom: const BorderSide(color: Color(0xFFD5E0EC)),
              ),
            ),
            child: Text(
              event.descriptionPlain.isEmpty
                  ? 'No description provided.'
                  : event.descriptionPlain,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppTheme.ink,
                    height: 1.45,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
