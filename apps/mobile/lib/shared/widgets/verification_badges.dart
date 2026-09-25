import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/theme/tokens.g.dart';
import '../../features/auth/data/models.dart';

/// Phone / Email / ID verification chips.
class VerificationBadges extends StatelessWidget {
  const VerificationBadges({required this.user, super.key});

  final AppUser user;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: SajhaSpacing.sm,
    runSpacing: SajhaSpacing.sm,
    children: [
      _Badge(label: 'Phone', verified: user.phoneVerified),
      _Badge(label: 'Email', verified: user.emailVerified),
      _Badge(label: 'ID', verified: user.idVerified),
    ],
  );
}

class _Badge extends StatelessWidget {
  const _Badge({required this.label, required this.verified});

  final String label;
  final bool verified;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: Icon(
        verified ? LucideIcons.badgeCheck : LucideIcons.circleAlert,
        size: 18,
        color: verified ? SajhaColors.success : SajhaColors.warning,
      ),
      label: Text(verified ? '$label verified' : '$label not verified'),
    );
  }
}
