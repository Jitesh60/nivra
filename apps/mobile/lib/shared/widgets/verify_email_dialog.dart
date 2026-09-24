import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/router/routes.dart';

/// Explains why a verified email is needed and offers to verify it now.
Future<void> askToVerifyEmail(
  BuildContext context, {
  required String why,
}) async {
  final go = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Verify your email first'),
      content: Text(why),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Later'),
        ),
        FilledButton(
          key: const ValueKey('verify-email-now'),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Verify email'),
        ),
      ],
    ),
  );
  if ((go ?? false) && context.mounted) context.push(Routes.setupEmail);
}
