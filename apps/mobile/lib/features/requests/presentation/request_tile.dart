import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show formatRupees;
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../data/models.dart';
import '../../../shared/widgets/sajha_badge.dart';

/// "12–14 Oct · Up to ₹200/day", or null when neither was given.
String? requestTerms(ItemRequest r) {
  final parts = [
    if (r.dates case final d?) formatRange(d),
    if (r.budgetPerDayPaise case final b?) 'Up to ${formatRupees(b)}/day',
  ];
  return parts.isEmpty ? null : parts.join(' · ');
}

/// A request in a list. Opens its page.
class RequestTile extends StatelessWidget {
  const RequestTile({required this.request, super.key});

  final ItemRequest request;

  @override
  Widget build(BuildContext context) {
    final r = request;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final terms = requestTerms(r);
    return Card(
      margin: EdgeInsets.zero,
      child: InkWell(
        key: ValueKey('request-${r.id}'),
        borderRadius: BorderRadius.circular(SajhaRadius.lg),
        onTap: () => context.push(Routes.request(r.id)),
        child: Padding(
          padding: const EdgeInsets.all(SajhaSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Text(r.title, style: text.titleMedium)),
                  if (r.answeredByMe) const SajhaBadge('You offered'),
                ],
              ),
              const SizedBox(height: SajhaSpacing.xs),
              Text(r.details, maxLines: 2, overflow: TextOverflow.ellipsis),
              const SizedBox(height: SajhaSpacing.xs),
              Text(
                [r.placeLine, ?terms].join(' · '),
                style: text.bodySmall?.copyWith(color: muted),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
