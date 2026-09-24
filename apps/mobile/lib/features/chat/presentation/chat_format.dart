import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show BlockedRange;
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../data/models.dart';

/// "14:05" today, "Yesterday", else "12 Oct".
String chatTime(DateTime at, {DateTime? now}) {
  final local = at.toLocal();
  final today = (now ?? DateTime.now()).toLocal();
  final day = DateTime(local.year, local.month, local.day);
  final todayDay = DateTime(today.year, today.month, today.day);
  if (day == todayDay) {
    return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
  }
  if (todayDay.difference(day).inDays == 1) return 'Yesterday';
  return formatRange(BlockedRange(day, day));
}

String offerDates(Offer o) => formatRange(BlockedRange(o.startDate, o.endDate));

/// A small round picture for a person, with initials when there's no photo.
class ParticipantAvatar extends StatelessWidget {
  const ParticipantAvatar({required this.person, this.radius = 20, super.key});

  final ChatParticipant person;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final url = person.avatarUrl;
    return CircleAvatar(
      radius: radius,
      backgroundColor: SajhaColors.brand100,
      foregroundColor: SajhaColors.brand800,
      foregroundImage: url == null ? null : NetworkImage(url),
      onForegroundImageError: url == null ? null : (_, _) {},
      child: Text(person.displayName[0].toUpperCase()),
    );
  }
}
