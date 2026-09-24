import 'package:flutter/material.dart';

/// Asks why (declining, cancelling, rejecting documents). Returns the text,
/// '' when [required] is false and left empty, or null if the user backed out.
Future<String?> askReason(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  String hint = 'Reason',
  bool required = true,
}) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        final text = controller.text.trim();
        final ok = !required || text.length >= 3;
        return AlertDialog(
          title: Text(title),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(message),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('reason-field'),
                controller: controller,
                autofocus: true,
                maxLength: 300,
                maxLines: 3,
                minLines: 1,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: required ? hint : '$hint (optional)',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Back'),
            ),
            FilledButton(
              key: const ValueKey('reason-confirm'),
              onPressed: ok ? () => Navigator.of(context).pop(text) : null,
              child: Text(confirmLabel),
            ),
          ],
        );
      },
    ),
  );
}
