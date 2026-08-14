import 'package:shared_preferences/shared_preferences.dart';

class SettingsStore {
  SettingsStore(this._prefs);

  static const defaultSourceUrl = 'https://efhsband.org/api/events';
  static const defaultApiBaseUrl = 'https://efhsband.org';
  static const _sourceKey = 'source_url';
  static const _apiBaseKey = 'api_base_url';
  static const _pushEnabledKey = 'push_enabled';
  static const _lastRevisionKey = 'last_push_revision';
  static const _cachedEventsKey = 'cached_events_json';
  static const _cachedAtKey = 'cached_events_at';
  static const _cachedSourceKey = 'cached_events_source';

  final SharedPreferences _prefs;

  static Future<SettingsStore> open() async {
    return SettingsStore(await SharedPreferences.getInstance());
  }

  String get sourceUrl {
    final value = (_prefs.getString(_sourceKey) ?? '').trim();
    return value.isEmpty ? defaultSourceUrl : value;
  }

  Future<void> setSourceUrl(String value) async {
    final trimmed = value.trim();
    await _prefs.setString(
      _sourceKey,
      trimmed.isEmpty ? defaultSourceUrl : trimmed,
    );
  }

  String get apiBaseUrl {
    final value = (_prefs.getString(_apiBaseKey) ?? '').trim();
    if (value.isNotEmpty) return value.replaceAll(RegExp(r'/+$'), '');
    return apiBaseFromSource(sourceUrl);
  }

  Future<void> setApiBaseUrl(String value) async {
    final trimmed = value.trim().replaceAll(RegExp(r'/+$'), '');
    await _prefs.setString(
      _apiBaseKey,
      trimmed.isEmpty ? defaultApiBaseUrl : trimmed,
    );
  }

  bool get pushEnabled => _prefs.getBool(_pushEnabledKey) ?? true;

  Future<void> setPushEnabled(bool value) => _prefs.setBool(_pushEnabledKey, value);

  int get lastPushRevision => _prefs.getInt(_lastRevisionKey) ?? 0;

  Future<void> setLastPushRevision(int value) =>
      _prefs.setInt(_lastRevisionKey, value);

  String? get cachedEventsJson => _prefs.getString(_cachedEventsKey);
  String? get cachedAt => _prefs.getString(_cachedAtKey);
  String? get cachedSource => _prefs.getString(_cachedSourceKey);

  Future<void> saveEventCache({
    required String sourceUrl,
    required String jsonBody,
  }) async {
    await _prefs.setString(_cachedEventsKey, jsonBody);
    await _prefs.setString(_cachedAtKey, DateTime.now().toIso8601String());
    await _prefs.setString(_cachedSourceKey, sourceUrl);
  }

  static String apiBaseFromSource(String sourceUrl) {
    final uri = Uri.tryParse(sourceUrl.trim());
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return defaultApiBaseUrl;
    }
    return uri.origin;
  }
}
