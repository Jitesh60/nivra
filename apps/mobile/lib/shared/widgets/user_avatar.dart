import 'package:flutter/material.dart';

import '../../core/theme/tokens.g.dart';
import '../../features/auth/data/models.dart';

/// Profile photo, or the user's initials when there is none (or it fails
/// to load).
class UserAvatar extends StatelessWidget {
  const UserAvatar({required this.user, this.radius = 24, super.key});

  final AppUser user;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final initials = CircleAvatar(
      radius: radius,
      backgroundColor: SajhaColors.brand100,
      foregroundColor: SajhaColors.brand800,
      child: Text(
        user.initials,
        style: TextStyle(fontSize: radius * 0.7, fontWeight: FontWeight.w600),
      ),
    );
    final url = user.avatarUrl;
    if (url == null) return initials;
    return ClipOval(
      child: Image.network(
        url,
        key: ValueKey(url),
        width: radius * 2,
        height: radius * 2,
        fit: BoxFit.cover,
        semanticLabel: 'Profile photo',
        errorBuilder: (_, _, _) => initials,
        loadingBuilder: (_, child, progress) =>
            progress == null ? child : initials,
      ),
    );
  }
}
