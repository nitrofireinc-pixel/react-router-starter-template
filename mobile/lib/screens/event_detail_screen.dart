import 'package:flutter/material.dart';

import '../models/calendar_event.dart';
import '../theme/app_theme.dart';

class EventDetailScreen extends StatelessWidget {
  const EventDetailScreen({super.key, required this.event});

  final CalendarEvent event;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Event')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
        children: [
          Text(
            event.dateHeading,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: AppTheme.steel,
                  letterSpacing: 0.4,
                  fontWeight: FontWeight.w700,
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
              border: Border.all(color: const Color(0xFFD5E0EC)),
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
