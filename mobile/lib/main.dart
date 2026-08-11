import 'package:flutter/material.dart';

import 'screens/event_list_screen.dart';
import 'services/event_repository.dart';
import 'services/push_service.dart';
import 'services/settings_store.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = await SettingsStore.open();
  final repository = EventRepository(settings);
  final pushService = PushService(settings, repository);
  await pushService.init();
  runApp(EfhsCalendarApp(
    settings: settings,
    repository: repository,
    pushService: pushService,
  ));
}

class EfhsCalendarApp extends StatelessWidget {
  const EfhsCalendarApp({
    super.key,
    required this.settings,
    required this.repository,
    required this.pushService,
  });

  final SettingsStore settings;
  final EventRepository repository;
  final PushService pushService;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EFHS Band Calendar',
      theme: AppTheme.light(),
      home: EventListScreen(
        settings: settings,
        repository: repository,
        pushService: pushService,
      ),
    );
  }
}
