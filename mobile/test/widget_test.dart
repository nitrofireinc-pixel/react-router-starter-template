import 'package:efhs_calendar/models/calendar_event.dart';
import 'package:efhs_calendar/models/calendar_track.dart';
import 'package:efhs_calendar/utils/plain_text.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('htmlToPlainText strips tags and entities', () {
    expect(
      htmlToPlainText('<span>Band Practice</span><div>4:15pm&nbsp;-&nbsp;6:30pm</div>'),
      'Band Practice\n4:15pm - 6:30pm',
    );
  });

  test('CalendarEvent.listFromJson parses EFHS feed rows', () {
    final events = CalendarEvent.listFromJson([
      {
        'id': 40,
        'date_label': 'Aug',
        'date_detail': '10',
        'event_year': 2026,
        'title': '<span>Band Practice</span>',
        'description': '<span>4:15pm-6:30pm</span>',
        'repeat_summary': 'Repeats Mon, Tue, Thu',
        'occurrence_date': '2026-08-10',
        'is_occurrence': true,
      },
    ]);
    expect(events, hasLength(1));
    expect(events.first.titlePlain, 'Band Practice');
    expect(events.first.dateHeading, '2026-08-10');
  });

  test('CalendarEvent parses Schedule Board track-colored events', () {
    final events = CalendarEvent.listFromJson([
      {
        'id': 12,
        'title': 'Football vs Rival',
        'description': 'Kickoff',
        'location': 'Home field',
        'who': 'Marching band',
        'start_date': '2026-09-12',
        'end_date': '',
        'start_time': '19:00',
        'end_time': '22:00',
        'track': 'game',
        'all_day': 0,
      },
    ]);
    expect(events, hasLength(1));
    final event = events.first;
    expect(event.trackId, 'game');
    expect(event.dateLabel, 'Sep');
    expect(event.dateDetail, '12');
    expect(event.eventYear, 2026);
    expect(event.timeLabel, '19:00–22:00');
    expect(event.track.color.toARGB32(), CalendarTrack.defaults.first.color.toARGB32());
  });

  test('CalendarTrack.listFromJson falls back to Schedule Board defaults', () {
    expect(CalendarTrack.listFromJson(null), CalendarTrack.defaults);
    final tracks = CalendarTrack.listFromJson([
      {'id': 'game', 'label': 'Games', 'color': '#E71321'},
    ]);
    expect(tracks, hasLength(1));
    expect(tracks.first.id, 'game');
  });

  test('CalendarPushState maps notification copy', () {
    final state = CalendarPushState.fromJson({
      'revision': 3,
      'action': 'created',
      'title': 'Spirit Week',
      'event_id': 12,
      'fcm_configured': true,
    });
    expect(state.notificationTitle, 'New calendar event');
    expect(state.notificationBody, 'Spirit Week');
    expect(state.fcmConfigured, isTrue);
  });
}
