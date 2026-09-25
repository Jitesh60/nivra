import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/requests_providers.dart';
import '../data/models.dart';
import 'request_screen.dart';
import 'request_tile.dart';

/// Things you asked for, newest first, with the offers lenders made.
class MyRequestsScreen extends ConsumerWidget {
  const MyRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mine = ref.watch(myRequestsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My requests')),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('my-requests-new'),
        onPressed: () => context.push(Routes.newRequest),
        icon: const Icon(LucideIcons.plus),
        label: const Text('Ask for something'),
      ),
      body: switch (mine) {
        AsyncData(:final value) when value.isEmpty => const Center(
          child: Padding(
            padding: EdgeInsets.all(SajhaSpacing.xl),
            child: Text(
              'Can’t find something on Nivra? Ask, and lenders nearby can '
              'offer theirs.',
              key: ValueKey('my-requests-empty'),
              textAlign: TextAlign.center,
            ),
          ),
        ),
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(myRequestsProvider.future),
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(
              SajhaSpacing.md,
              SajhaSpacing.md,
              SajhaSpacing.md,
              96,
            ),
            itemCount: value.length,
            separatorBuilder: (_, _) => const SizedBox(height: SajhaSpacing.sm),
            itemBuilder: (_, i) => _MyRequestCard(value[i]),
          ),
        ),
        AsyncError(:final error) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Couldn’t load your requests.',
              ),
              TextButton(
                onPressed: () => ref.invalidate(myRequestsProvider),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _MyRequestCard extends ConsumerWidget {
  const _MyRequestCard(this.detail);

  final ItemRequestDetail detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final r = detail.request;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final open = r.status == RequestStatus.open;
    final terms = requestTerms(r);
    final count = detail.responses.length;

    return Card(
      key: ValueKey('my-request-${r.id}'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          SajhaSpacing.md,
          SajhaSpacing.sm,
          SajhaSpacing.md,
          SajhaSpacing.sm,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ListTile(
              key: ValueKey('request-${r.id}'),
              contentPadding: EdgeInsets.zero,
              title: Text(r.title, style: text.titleMedium),
              subtitle: Text(
                [if (!open) r.status.label, r.areaLabel, ?terms].join(' · '),
                style: TextStyle(color: muted),
              ),
              trailing: const Icon(LucideIcons.chevronRight),
              onTap: () => context.push(Routes.request(r.id)),
            ),
            Text(
              count == 0
                  ? (open ? 'No offers yet' : 'No offers')
                  : '$count ${count == 1 ? 'offer' : 'offers'}',
              style: text.labelLarge,
            ),
            for (final x in detail.responses) ResponseTile(response: x),
            if (open)
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  key: ValueKey('close-${r.id}'),
                  onPressed: () => closeRequest(context, ref, r),
                  child: const Text('Close'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
