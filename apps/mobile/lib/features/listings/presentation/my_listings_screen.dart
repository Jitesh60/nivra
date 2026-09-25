import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../settings/presentation/settings_screen.dart';
import '../data/listings_repository.dart';
import '../data/models.dart';
import 'listing_detail_view.dart';

/// The lender's listings with their status, and what they can do with each.
class MyListingsScreen extends ConsumerWidget {
  const MyListingsScreen({super.key});

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function(ListingsRepository repo) action, {
    String? done,
  }) async {
    try {
      await action(ref.read(listingsRepositoryProvider));
      ref.invalidate(myListingsProvider);
      if (done != null && context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(done)));
      }
    } on ApiException catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    }
  }

  Future<void> _actions(
    BuildContext context,
    WidgetRef ref,
    MyListing l,
  ) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.eye),
              title: const Text('Preview'),
              onTap: () => Navigator.pop(context, 'preview'),
            ),
            if (l.status.editable)
              ListTile(
                key: const ValueKey('action-edit'),
                leading: const Icon(LucideIcons.pencil),
                title: const Text('Edit'),
                onTap: () => Navigator.pop(context, 'edit'),
              ),
            if (l.status == ListingStatus.live)
              ListTile(
                key: const ValueKey('action-pause'),
                leading: const Icon(LucideIcons.circlePause),
                title: const Text('Pause'),
                subtitle: const Text('Hide it until you resume'),
                onTap: () => Navigator.pop(context, 'pause'),
              ),
            if (l.status == ListingStatus.paused)
              ListTile(
                key: const ValueKey('action-resume'),
                leading: const Icon(LucideIcons.circlePlay),
                title: const Text('Resume'),
                onTap: () => Navigator.pop(context, 'resume'),
              ),
            ListTile(
              key: const ValueKey('action-delete'),
              leading: Icon(
                LucideIcons.trash2,
                color: Theme.of(context).colorScheme.error,
              ),
              title: Text(
                'Delete',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              onTap: () => Navigator.pop(context, 'delete'),
            ),
          ],
        ),
      ),
    );
    if (action == null || !context.mounted) return;
    switch (action) {
      case 'preview':
        await context.push(Routes.listingPreview, extra: l);
      case 'edit':
        await context.push(Routes.editListing, extra: l);
        ref.invalidate(myListingsProvider);
      case 'pause':
        await _run(
          context,
          ref,
          (r) => r.pause(l.id),
          done: 'Paused. It’s hidden from borrowers.',
        );
      case 'resume':
        await _run(context, ref, (r) => r.unpause(l.id), done: 'Live again.');
      case 'delete':
        final ok = await confirm(
          context,
          title: 'Delete “${l.title}”?',
          body: 'The listing and its photos are removed. This can’t be undone.',
          action: 'Delete',
          destructive: true,
        );
        if (ok && context.mounted) {
          await _run(
            context,
            ref,
            (r) => r.delete(l.id),
            done: 'Listing deleted.',
          );
        }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listings = ref.watch(myListingsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('My listings')),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('new-listing'),
        onPressed: () async {
          await context.push(Routes.newListing);
          ref.invalidate(myListingsProvider);
        },
        icon: const Icon(LucideIcons.plus),
        label: const Text('List an item'),
      ),
      body: switch (listings) {
        AsyncData(:final value) when value.isEmpty => const Center(
          child: Padding(
            padding: EdgeInsets.all(SajhaSpacing.xl),
            child: Text(
              'Nothing listed yet. Earn from things you rarely use: a tent, '
              'a camera, a drill.',
              textAlign: TextAlign.center,
            ),
          ),
        ),
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(myListingsProvider.future),
          child: ListView.separated(
            padding: const EdgeInsets.only(bottom: 96),
            itemCount: value.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) => _ListingTile(
              listing: value[i],
              onTap: () => _actions(context, ref, value[i]),
            ),
          ),
        ),
        AsyncError(:final error) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Something went wrong',
              ),
              TextButton(
                onPressed: () => ref.invalidate(myListingsProvider),
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

class _ListingTile extends StatelessWidget {
  const _ListingTile({required this.listing, required this.onTap});
  final MyListing listing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = listing;
    final (color, icon) = switch (l.status) {
      ListingStatus.live => (SajhaColors.success, LucideIcons.circleCheck),
      ListingStatus.pending => (SajhaColors.info, LucideIcons.hourglass),
      ListingStatus.paused => (SajhaColors.ink500, LucideIcons.circlePause),
      ListingStatus.rejected ||
      ListingStatus.removed => (SajhaColors.danger, LucideIcons.circleAlert),
      _ => (SajhaColors.warning, LucideIcons.notebookPen),
    };
    final reason = switch (l.status) {
      ListingStatus.rejected => 'Edit it to fix: ${l.rejectionReason}',
      ListingStatus.removed => 'Removed by Nivra: ${l.rejectionReason}',
      ListingStatus.pending => 'We’re checking your first listing.',
      _ => null,
    };
    return ListTile(
      key: ValueKey('my-listing-${l.id}'),
      onTap: onTap,
      leading: ClipRRect(
        borderRadius: BorderRadius.circular(SajhaRadius.md),
        child: SizedBox(
          width: 56,
          height: 56,
          child: l.cover == null
              ? const ColoredBox(
                  color: SajhaColors.ink100,
                  child: Icon(LucideIcons.image),
                )
              : ViewPhoto.url(l.cover!.thumbUrl).image(),
        ),
      ),
      title: Text(l.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${formatRupees(l.pricePerDayPaise)}/day'),
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: SajhaSpacing.xs),
              Text(l.status.label, style: TextStyle(color: color)),
            ],
          ),
          if (reason != null) Text(reason),
        ],
      ),
      isThreeLine: true,
      trailing: const Icon(LucideIcons.ellipsisVertical),
    );
  }
}

/// How borrowers will see one of your listings.
class ListingPreviewScreen extends StatelessWidget {
  const ListingPreviewScreen({required this.listing, super.key});
  final MyListing listing;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Preview')),
    body: ListingDetailView(data: ListingViewData.fromListing(listing)),
  );
}
