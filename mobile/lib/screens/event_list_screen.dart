import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/calendar_event.dart';
import '../models/calendar_track.dart';
import '../services/event_repository.dart';
import '../services/push_service.dart';
import '../services/settings_store.dart';
import '../theme/app_theme.dart';
import 'event_detail_screen.dart';
import 'help_screen.dart';
import 'settings_screen.dart';

class EventListScreen extends StatefulWidget {
  const EventListScreen({
    super.key,
    required this.settings,
    required this.repository,
    required this.pushService,
  });

  final SettingsStore settings;
  final EventRepository repository;
  final PushService pushService;

  @override
  State<EventListScreen> createState() => _EventListScreenState();
}

class _EventListScreenState extends State<EventListScreen>
    with WidgetsBindingObserver {
  bool _loading = true;
  List<CalendarEvent> _events = const [];
  List<CalendarTrack> _tracks = CalendarTrack.defaults;
  String? _error;
  bool _fromCache = false;
  DateTime? _fetchedAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      widget.pushService.checkForUpdatesOnResume();
    }
  }

  Future<void> _bootstrap() async {
    await widget.pushService.syncPermissionsAndRegistration();
    await _reload();
  }

  Future<void> _reload() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final result = await widget.repository.fetchEvents();
    if (!mounted) return;
    setState(() {
      _events = result.events;
      _tracks = result.tracks.isEmpty ? CalendarTrack.defaults : result.tracks;
      _fromCache = result.fromCache;
      _fetchedAt = result.fetchedAt;
      _error = result.error;
      _loading = false;
    });
    await widget.pushService.checkForUpdatesOnResume();
  }

  Future<void> _openSettings() async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => SettingsScreen(
          settings: widget.settings,
          pushService: widget.pushService,
          onChanged: _reload,
        ),
      ),
    );
  }

  CalendarTrack _trackFor(CalendarEvent event) =>
      CalendarTrack.resolve(event.trackId, {
        for (final track in _tracks) track.id: track,
      });

  @override
  Widget build(BuildContext context) {
    final fetchedLabel = _fetchedAt == null
        ? null
        : DateFormat('MMM d · h:mm a').format(_fetchedAt!.toLocal());

    return Scaffold(
      appBar: AppBar(
        title: const Text('EFHS Band Calendar'),
        actions: [
          IconButton(
            tooltip: 'Help',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const HelpScreen()),
              );
            },
            icon: const Icon(Icons.help_outline),
          ),
          IconButton(
            tooltip: 'Settings',
            onPressed: _openSettings,
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFFE7F0F8), Color(0xFFF3F7FB)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Upcoming events',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: AppTheme.navy,
                        fontWeight: FontWeight.w800,
                      ),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    if (_fromCache) 'Showing cached events',
                    if (fetchedLabel != null) 'Updated $fetchedLabel',
                    if (_error != null && _events.isNotEmpty) 'Last refresh had an error',
                  ].where((part) => part.isNotEmpty).join(' · '),
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppTheme.steel,
                      ),
                ),
                const SizedBox(height: 10),
                _TrackLegend(tracks: _tracks),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _reload,
              child: _buildBody(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading && _events.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 120),
          Center(child: CircularProgressIndicator()),
        ],
      );
    }

    if (_events.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 48),
          Text(
            _error == null ? 'No upcoming events.' : 'Could not load events.',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: AppTheme.navy,
                  fontWeight: FontWeight.w700,
                ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!),
          ],
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _reload,
            child: const Text('Try again'),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 28),
      itemCount: _events.length + (_error != null ? 1 : 0),
      separatorBuilder: (_, index) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        if (_error != null && index == 0) {
          return Material(
            color: const Color(0xFFFFF4E5),
            borderRadius: BorderRadius.circular(12),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(_error!, style: const TextStyle(color: Color(0xFF7A4E00))),
            ),
          );
        }
        final event = _events[_error != null ? index - 1 : index];
        final track = _trackFor(event);
        return Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => EventDetailScreen(event: event, track: track),
                ),
              );
            },
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    width: 6,
                    decoration: BoxDecoration(
                      color: track.color,
                      borderRadius: const BorderRadius.horizontal(
                        left: Radius.circular(14),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 14, 14, 14),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 58,
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              color: track.color.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: track.color.withValues(alpha: 0.35),
                              ),
                            ),
                            child: Column(
                              children: [
                                Text(
                                  event.dateLabel.isEmpty ? '—' : event.dateLabel,
                                  style: TextStyle(
                                    color: track.color,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  event.dateDetail.isEmpty ? '' : event.dateDetail,
                                  style: TextStyle(
                                    color: track.foreground == Colors.white
                                        ? AppTheme.navy
                                        : track.ink ?? AppTheme.navy,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 18,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 3,
                                  ),
                                  decoration: BoxDecoration(
                                    color: track.color,
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    track.label,
                                    style: TextStyle(
                                      color: track.foreground,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.2,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  event.titlePlain.isEmpty
                                      ? 'Untitled event'
                                      : event.titlePlain,
                                  style: const TextStyle(
                                    color: AppTheme.ink,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 16,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '${event.dateHeading} · ${event.timeLabel}',
                                  style: const TextStyle(color: AppTheme.steel),
                                ),
                                if (event.descriptionPlain.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    event.descriptionPlain,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Color(0xFF40566C)),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right, color: AppTheme.steel),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TrackLegend extends StatelessWidget {
  const _TrackLegend({required this.tracks});

  final List<CalendarTrack> tracks;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          Text(
            'Legend',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: AppTheme.navy,
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(width: 10),
          ...tracks.map((track) {
            return Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: track.color,
                      borderRadius: BorderRadius.circular(3),
                      border: Border.all(color: const Color(0x33002142)),
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    track.label,
                    style: const TextStyle(
                      color: AppTheme.steel,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }
}
