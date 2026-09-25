import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/theme/tokens.g.dart';

/// An icon in a primary-soft circle, a title, a hint and one action
/// (DESIGN.md §7).
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final t = SajhaTokens.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                color: t.primarySoft,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: SajhaSize.iconLg, color: t.onPrimarySoft),
            ),
            const SizedBox(height: SajhaSpacing.md),
            Text(
              title,
              textAlign: TextAlign.center,
              style: SajhaType.h3.copyWith(color: t.foreground),
            ),
            if (message != null) ...[
              const SizedBox(height: SajhaSpacing.xs),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: SajhaType.small.copyWith(color: t.mutedForeground),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: SajhaSpacing.md),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
