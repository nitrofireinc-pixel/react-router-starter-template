import '../utils/plain_text.dart';

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
    this.raw = const {},
  });

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
  final Map<String, dynamic> raw;

  String get titlePlain => htmlToPlainText(title);
  String get descriptionPlain => htmlToPlainText(description);

  String get dateHeading {
    if (occurrenceDate != null && occurrenceDate!.isNotEmpty) {
      return occurrenceDate!;
    }
    final month = dateLabel.trim();
    final day = dateDetail.trim();
    final year = eventYear > 0 ? eventYear.toString() : '';
    return [month, day, year].where((part) => part.isNotEmpty).join(' ');
  }

  String get listSubtitle {
    final bits = <String>[dateHeading];
    if (repeatSummary.trim().isNotEmpty) bits.add(repeatSummary.trim());
    return bits.join(' · ');
  }

  factory CalendarEvent.fromJson(Map<String, dynamic> json) {
    return CalendarEvent(
      id: _asInt(json['id']) ?? 0,
      title: _asString(json['title']),
      description: _asString(json['description']),
      dateLabel: _asString(json['date_label']),
      dateDetail: _asString(json['date_detail']),
      eventYear: _asInt(json['event_year']) ?? 0,
      repeatSummary: _asString(json['repeat_summary']),
      occurrenceDate: _nullableString(json['occurrence_date']),
      isOccurrence: json['is_occurrence'] == true || json['is_occurrence'] == 1,
      seriesId: _asInt(json['series_id']),
      raw: Map<String, dynamic>.from(json),
    );
  }

  static List<CalendarEvent> listFromJson(dynamic payload) {
    if (payload is! List) {
      throw const FormatException('Calendar feed must be a JSON array of events.');
    }
    return payload
        .whereType<Map>()
        .map((item) => CalendarEvent.fromJson(Map<String, dynamic>.from(item)))
        .toList();
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
