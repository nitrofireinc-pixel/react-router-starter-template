import 'package:flutter/material.dart';

import '../services/push_service.dart';
import '../services/settings_store.dart';
import '../theme/app_theme.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({
    super.key,
    required this.settings,
    required this.pushService,
    required this.onChanged,
  });

  final SettingsStore settings;
  final PushService pushService;
  final Future<void> Function() onChanged;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _sourceController;
  late final TextEditingController _apiBaseController;
  late bool _pushEnabled;
  bool _saving = false;
  String? _status;

  @override
  void initState() {
    super.initState();
    _sourceController = TextEditingController(text: widget.settings.sourceUrl);
    _apiBaseController = TextEditingController(text: widget.settings.apiBaseUrl);
    _pushEnabled = widget.settings.pushEnabled;
  }

  @override
  void dispose() {
    _sourceController.dispose();
    _apiBaseController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _status = null;
    });
    try {
      final source = _sourceController.text.trim();
      final uri = Uri.tryParse(source);
      if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
        throw const FormatException('Enter a full https:// source URL.');
      }
      await widget.settings.setSourceUrl(source);
      final apiBase = _apiBaseController.text.trim();
      if (apiBase.isEmpty) {
        await widget.settings.setApiBaseUrl(SettingsStore.apiBaseFromSource(source));
        _apiBaseController.text = widget.settings.apiBaseUrl;
      } else {
        await widget.settings.setApiBaseUrl(apiBase);
      }
      await widget.pushService.setEnabled(_pushEnabled);
      await widget.onChanged();
      if (!mounted) return;
      setState(() => _status = 'Saved.');
    } catch (error) {
      if (!mounted) return;
      setState(() => _status = error.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 36),
        children: [
          Text(
            'Calendar source',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: AppTheme.navy,
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _sourceController,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'Events JSON URL',
              hintText: SettingsStore.defaultSourceUrl,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _apiBaseController,
            keyboardType: TextInputType.url,
            decoration: const InputDecoration(
              labelText: 'API base for push registration',
              hintText: SettingsStore.defaultApiBaseUrl,
              helperText:
                  'Used for /api/push/register and /api/calendar-push-state',
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () {
                _sourceController.text = SettingsStore.defaultSourceUrl;
                _apiBaseController.text = SettingsStore.defaultApiBaseUrl;
              },
              child: const Text('Reset to East Forsyth defaults'),
            ),
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Calendar push notifications'),
            subtitle: Text(
              widget.pushService.firebaseReady
                  ? 'FCM topic ${PushService.topic} + revision checks'
                  : 'Checks every ~15 minutes in the background, and again when you open the app. Instant FCM push needs a Firebase project.',
            ),
            value: _pushEnabled,
            onChanged: (value) => setState(() => _pushEnabled = value),
          ),
          if (widget.pushService.lastError != null) ...[
            const SizedBox(height: 8),
            Text(
              widget.pushService.lastError!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: AppTheme.steel,
                  ),
            ),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'Saving…' : 'Save settings'),
          ),
          if (_status != null) ...[
            const SizedBox(height: 12),
            Text(_status!),
          ],
        ],
      ),
    );
  }
}
