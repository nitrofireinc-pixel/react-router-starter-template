import 'package:flutter/material.dart';

/// Matches the public Schedule Board palette (`CALDEV_TRACKS` / `/api/caldev/tracks`).
class CalendarTrack {
  const CalendarTrack({
    required this.id,
    required this.label,
    required this.color,
    this.ink,
  });

  final String id;
  final String label;
  final Color color;
  final Color? ink;

  Color get foreground => ink ?? _contrastInk(color);

  static const defaults = <CalendarTrack>[
    CalendarTrack(id: 'game', label: 'Games', color: Color(0xFFE71321)),
    CalendarTrack(id: 'rehearsal', label: 'Rehearsals', color: Color(0xFF014990)),
    CalendarTrack(id: 'meeting', label: 'Meetings', color: Color(0xFF002142)),
    CalendarTrack(
      id: 'deadline',
      label: 'Deadlines',
      color: Color(0xFFFDD703),
      ink: Color(0xFF002142),
    ),
    CalendarTrack(id: 'trip', label: 'Trips', color: Color(0xFF7C3AED)),
    CalendarTrack(id: 'other', label: 'Other', color: Color(0xFF5B6472)),
  ];

  static final Map<String, CalendarTrack> defaultMap = {
    for (final track in defaults) track.id: track,
  };

  factory CalendarTrack.fromJson(Map<String, dynamic> json) {
    final id = (json['id']?.toString() ?? 'other').trim().toLowerCase();
    final fallback = defaultMap[id] ?? defaultMap['other']!;
    return CalendarTrack(
      id: id.isEmpty ? 'other' : id,
      label: (json['label']?.toString() ?? fallback.label).trim().isEmpty
          ? fallback.label
          : json['label'].toString().trim(),
      color: _parseColor(json['color']) ?? fallback.color,
      ink: _parseColor(json['ink']) ?? fallback.ink,
    );
  }

  static List<CalendarTrack> listFromJson(dynamic payload) {
    if (payload is! List || payload.isEmpty) return defaults;
    final parsed = payload
        .whereType<Map>()
        .map((item) => CalendarTrack.fromJson(Map<String, dynamic>.from(item)))
        .toList();
    return parsed.isEmpty ? defaults : parsed;
  }

  static CalendarTrack resolve(
    String? trackId, [
    Map<String, CalendarTrack>? map,
  ]) {
    final id = (trackId ?? 'other').trim().toLowerCase();
    final source = map ?? defaultMap;
    return source[id] ?? source['other'] ?? defaults.last;
  }

  static Color? _parseColor(dynamic value) {
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) return null;
    final hex = raw.replaceFirst('#', '');
    if (hex.length == 6) {
      final parsed = int.tryParse(hex, radix: 16);
      if (parsed != null) return Color(0xFF000000 | parsed);
    }
    if (hex.length == 8) {
      final parsed = int.tryParse(hex, radix: 16);
      if (parsed != null) return Color(parsed);
    }
    return null;
  }

  static Color _contrastInk(Color color) {
    final luminance = color.computeLuminance();
    return luminance > 0.55 ? const Color(0xFF002142) : Colors.white;
  }
}
