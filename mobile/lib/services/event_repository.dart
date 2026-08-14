import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/calendar_event.dart';
import 'settings_store.dart';

class EventFetchResult {
  const EventFetchResult({
    required this.events,
    required this.fromCache,
    this.fetchedAt,
    this.error,
  });

  final List<CalendarEvent> events;
  final bool fromCache;
  final DateTime? fetchedAt;
  final String? error;
}

class EventRepository {
  EventRepository(this._settings, {http.Client? client})
      : _client = client ?? http.Client();

  final SettingsStore _settings;
  final http.Client _client;

  Future<EventFetchResult> fetchEvents({bool allowCacheFallback = true}) async {
    final source = _settings.sourceUrl;
    try {
      final response = await _client
          .get(Uri.parse(source), headers: {'accept': 'application/json'})
          .timeout(const Duration(seconds: 20));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw FormatException('Source returned HTTP ${response.statusCode}');
      }
      final decoded = jsonDecode(response.body);
      final events = CalendarEvent.listFromJson(decoded);
      await _settings.saveEventCache(sourceUrl: source, jsonBody: response.body);
      return EventFetchResult(
        events: events,
        fromCache: false,
        fetchedAt: DateTime.now(),
      );
    } catch (error) {
      if (!allowCacheFallback) rethrow;
      final cached = _readCache(forSource: source);
      if (cached != null) {
        return EventFetchResult(
          events: cached.events,
          fromCache: true,
          fetchedAt: cached.fetchedAt,
          error: error.toString(),
        );
      }
      return EventFetchResult(
        events: const [],
        fromCache: false,
        error: error.toString(),
      );
    }
  }

  Future<CalendarPushState?> fetchPushState() async {
    final uri = Uri.parse('${_settings.apiBaseUrl}/api/calendar-push-state');
    final response = await _client
        .get(uri, headers: {'accept': 'application/json'})
        .timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw FormatException('Push state returned HTTP ${response.statusCode}');
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw const FormatException('Push state must be a JSON object');
    }
    return CalendarPushState.fromJson(Map<String, dynamic>.from(decoded));
  }

  Future<void> registerPushToken({
    required String token,
    required String platform,
  }) async {
    final uri = Uri.parse('${_settings.apiBaseUrl}/api/push/register');
    final response = await _client
        .post(
          uri,
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
          },
          body: jsonEncode({
            'token': token,
            'platform': platform,
            'app_id': 'efhs_calendar',
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw FormatException('Push register returned HTTP ${response.statusCode}');
    }
  }

  Future<void> unregisterPushToken(String token) async {
    final uri = Uri.parse('${_settings.apiBaseUrl}/api/push/register');
    final response = await _client
        .delete(
          uri,
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
          },
          body: jsonEncode({'token': token}),
        )
        .timeout(const Duration(seconds: 15));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw FormatException('Push unregister returned HTTP ${response.statusCode}');
    }
  }

  EventFetchResult? _readCache({required String forSource}) {
    final body = _settings.cachedEventsJson;
    final cachedSource = _settings.cachedSource;
    if (body == null || body.isEmpty || cachedSource != forSource) return null;
    try {
      final events = CalendarEvent.listFromJson(jsonDecode(body));
      final at = DateTime.tryParse(_settings.cachedAt ?? '');
      return EventFetchResult(events: events, fromCache: true, fetchedAt: at);
    } catch (_) {
      return null;
    }
  }
}
