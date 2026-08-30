import '../utils/plain_text.dart';
import 'calendar_track.dart';

class CalendarEvent {
  const CalendarEvent({
    required this.id,
    required this.title,
    required this.description,
    required this.dateLabel,
    required this.dateDetail,
    required this.eventYear,
    this.repeatSummary = '',
    this.occurrenceDate,
    this.isOccurrence = false,
    this.seriesId,
    this.trackId = 'other',
    this.location = '',
    this.who = '',
    this.startDate = '',
    this.endDate = '',
    this.startTime = '',
    this.endTime = '',
    this.allDay = true,
    this.raw = const {},
  });

  static const _monthLabels = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  final int id;
  final String title;
  final String description;
  final String dateLabel;
  final String dateDetail;
  final int eventYear;
  final String repeatSummary;
  final String? occurrenceDate;
  final bool isOccurrence;
  final int? seriesId;
  final String trackId;
  final String location;
  final String who;
  final String startDate;
  final String endDate;
  final String startTime;
  final String endTime;
  final bool allDay;
  final Map<String, dynamic> raw;

  String get titlePlain => htmlToPlainText(title);
  String get descriptionPlain => htmlToPlainText(description);
  String get locationPlain => htmlToPlainText(location);
  String get whoPlain => htmlToPlainText(who);

  CalendarTrack get track => CalendarTrack.resolve(trackId);

  String get sortKey {
    final date = (startDate.isNotEmpty
            ? startDate
            : (occurrenceDate ?? _isoFromParts()))
        .padRight(10, '9');
    final time = allDay || startTime.isEmpty ? '99:99' : startTime;
    return '$date|$time|${titlePlain.toLowerCase()}|$id';
  }

  bool get isUpcoming {
    final iso = startDate.isNotEmpty ? startDate : (occurrenceDate ?? _isoFromParts());
    if (iso.isEmpty || iso.length < 10) return true;
    final today = DateTime.now();
    final todayIso =
        '${today.year.toString().padLeft(4, '0')}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final end = endDate.isNotEmpty && endDate.compareTo(iso) >= 0 ? endDate : iso;
    return end.compareTo(todayIso) >= 0;
  }

  String get dateHeading {
    if (occurrenceDate != null && occurrenceDate!.isNotEmpty) {
      return occurrenceDate!;
    }
    if (startDate.isNotEmpty) {
      return _friendlyDate(startDate);
    }
    final month = dateLabel.trim();
    final day = dateDetail.trim();
    final year = eventYear > 0 ? eventYear.toString() : '';
    return [month, day, year].where((part) => part.isNotEmpty).join(' ');
  }

  String get timeLabel {
    if (allDay || startTime.isEmpty) return 'All day';
    if (endTime.isNotEmpty) return '$startTime–$endTime';
    return startTime;
  }

  String get listSubtitle {
    final bits = <String>[dateHeading, timeLabel];
    if (track.label.isNotEmpty) bits.insert(1, track.label);
    if (repeatSummary.trim().isNotEmpty) bits.add(repeatSummary.trim());
    return bits.join(' · ');
  }

  factory CalendarEvent.fromJson(Map<String, dynamic> json) {
    final startDate = _nullableString(json['start_date']) ?? '';
    final parts = _partsFromIso(startDate);
    final legacyLabel = _asString(json['date_label']);
    final legacyDetail = _asString(json['date_detail']);
    final legacyYear = _asInt(json['event_year']) ?? 0;

    return CalendarEvent(
      id: _asInt(json['id']) ?? 0,
      title: _asString(json['title']),
      description: _asString(json['description']),
      dateLabel: parts?.label ?? legacyLabel,
      dateDetail: parts?.detail ?? legacyDetail,
      eventYear: parts?.year ?? legacyYear,
      repeatSummary: _asString(json['repeat_summary']),
      occurrenceDate: _nullableString(json['occurrence_date']),
      isOccurrence: json['is_occurrence'] == true || json['is_occurrence'] == 1,
      seriesId: _asInt(json['series_id']),
      trackId: _normalizeTrack(_asString(json['track'])),
      location: _asString(json['location']),
      who: _asString(json['who']),
      startDate: startDate,
      endDate: _nullableString(json['end_date']) ?? '',
      startTime: _asString(json['start_time']),
      endTime: _asString(json['end_time']),
      allDay: json['all_day'] == null
          ? (_asString(json['start_time']).isEmpty)
          : (json['all_day'] == true || json['all_day'] == 1 || json['all_day'] == '1'),
      raw: Map<String, dynamic>.from(json),
    );
  }

  static List<CalendarEvent> listFromJson(dynamic payload) {
    if (payload is! List) {
      throw const FormatException('Calendar feed must be a JSON array of events.');
    }
    final events = payload
        .whereType<Map>()
        .map((item) => CalendarEvent.fromJson(Map<String, dynamic>.from(item)))
        .toList();
    events.sort((a, b) => a.sortKey.compareTo(b.sortKey));
    return events;
  }

  String _isoFromParts() {
    final month = _monthLabels.indexWhere(
      (label) => label.toLowerCase() == dateLabel.trim().toLowerCase(),
    );
    final day = int.tryParse(dateDetail.trim()) ?? 0;
    if (eventYear < 2000 || month < 0 || day < 1) return '';
    return '$eventYear-${(month + 1).toString().padLeft(2, '0')}-${day.toString().padLeft(2, '0')}';
  }

  static String _friendlyDate(String iso) {
    final parts = _partsFromIso(iso);
    if (parts == null) return iso;
    return '${parts.label} ${parts.detail}, ${parts.year}';
  }

  static ({String label, String detail, int year})? _partsFromIso(String iso) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso.trim());
    if (match == null) return null;
    final year = int.tryParse(match.group(1)!) ?? 0;
    final month = int.tryParse(match.group(2)!) ?? 0;
    final day = int.tryParse(match.group(3)!) ?? 0;
    if (year < 2000 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return (
      label: _monthLabels[month - 1],
      detail: day.toString().padLeft(2, '0'),
      year: year,
    );
  }

  static String _normalizeTrack(String value) {
    final track = value.trim().toLowerCase();
    return CalendarTrack.defaultMap.containsKey(track) ? track : 'other';
  }

  static int? _asInt(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }

  static String _asString(dynamic value) => value?.toString() ?? '';

  static String? _nullableString(dynamic value) {
    final text = value?.toString().trim() ?? '';
    return text.isEmpty ? null : text;
  }
}

class CalendarPushState {
  const CalendarPushState({
    required this.revision,
    this.action = '',
    this.title = '',
    this.eventId,
    this.at = '',
    this.topic = 'efhs_calendar',
    this.fcmConfigured = false,
  });

  final int revision;
  final String action;
  final String title;
  final int? eventId;
  final String at;
  final String topic;
  final bool fcmConfigured;

  factory CalendarPushState.fromJson(Map<String, dynamic> json) {
    return CalendarPushState(
      revision: CalendarEvent._asInt(json['revision']) ?? 0,
      action: CalendarEvent._asString(json['action']),
      title: CalendarEvent._asString(json['title']),
      eventId: CalendarEvent._asInt(json['event_id']),
      at: CalendarEvent._asString(json['at']),
      topic: CalendarEvent._asString(json['topic']).isEmpty
          ? 'efhs_calendar'
          : CalendarEvent._asString(json['topic']),
      fcmConfigured: json['fcm_configured'] == true,
    );
  }

  String get notificationTitle {
    switch (action) {
      case 'created':
        return 'New calendar event';
      case 'deleted':
        return 'Calendar event removed';
      case 'updated':
        return 'Calendar event updated';
      default:
        return 'Calendar update';
    }
  }

  String get notificationBody =>
      title.trim().isEmpty ? 'The band calendar changed.' : title.trim();
}
