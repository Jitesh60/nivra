import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/data/auth_repository.dart';
import '../../settings/presentation/settings_screen.dart';
import '../data/documents_repository.dart';
import '../data/models.dart';
import 'document_viewer_screen.dart';

final myDocumentsProvider = FutureProvider.autoDispose<List<UserDocument>>(
  (ref) => ref.watch(documentsRepositoryProvider).list(),
);

/// Re-reads `/me` so the ID badge follows document changes. Best effort.
Future<void> refreshUser(WidgetRef ref) async {
  try {
    final user = await ref.read(authRepositoryProvider).me();
    ref.read(authControllerProvider.notifier).userUpdated(user);
  } on ApiException {
    // The badge catches up on the next app start.
  }
}

/// "My documents": the private vault of ID documents.
class DocumentsScreen extends ConsumerWidget {
  const DocumentsScreen({super.key});

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final added = await context.push<bool>(Routes.documentsAdd);
    if (added ?? false) {
      ref.invalidate(myDocumentsProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Document added. We’ll review it shortly.'),
          ),
        );
      }
    }
  }

  Future<void> _actions(
    BuildContext context,
    WidgetRef ref,
    UserDocument doc,
  ) async {
    final action = await showModalBottomSheet<_Action>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(LucideIcons.eye),
              title: Text(doc.hasBack ? 'View front' : 'View'),
              onTap: () => Navigator.pop(context, _Action.viewFront),
            ),
            if (doc.hasBack)
              ListTile(
                leading: const Icon(LucideIcons.flipHorizontal),
                title: const Text('View back'),
                onTap: () => Navigator.pop(context, _Action.viewBack),
              ),
            ListTile(
              key: const ValueKey('delete-document'),
              leading: Icon(
                LucideIcons.trash2,
                color: Theme.of(context).colorScheme.error,
              ),
              title: Text(
                'Delete',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              onTap: () => Navigator.pop(context, _Action.delete),
            ),
          ],
        ),
      ),
    );
    if (action == null || !context.mounted) return;

    switch (action) {
      case _Action.viewFront || _Action.viewBack:
        await context.push(
          Routes.documentView,
          extra: DocumentViewArgs(
            documentId: doc.id,
            title: doc.title,
            side: action == _Action.viewBack
                ? DocumentSide.back
                : DocumentSide.front,
          ),
        );
      case _Action.delete:
        final ok = await confirm(
          context,
          title: 'Delete ${doc.title}?',
          body: doc.status == DocumentStatus.approved
              ? 'The photos are deleted. If this is your only approved ID, '
                    'you’ll lose the ID verified badge.'
              : 'The photos are deleted from Nivra.',
          action: 'Delete',
          destructive: true,
        );
        if (!ok || !context.mounted) return;
        try {
          await ref.read(documentsRepositoryProvider).delete(doc.id);
          // The reload refreshes the badge (see the listener in build).
          ref.invalidate(myDocumentsProvider);
        } on ApiException catch (e) {
          if (context.mounted) {
            ScaffoldMessenger.of(context)
                .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
          }
        }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final docs = ref.watch(myDocumentsProvider);
    // A review may have happened since the last visit.
    ref.listen(myDocumentsProvider, (_, next) {
      if (next is AsyncData) refreshUser(ref);
    });

    return Scaffold(
      appBar: AppBar(title: const Text('My documents')),
      floatingActionButton: docs is AsyncData
          ? FloatingActionButton.extended(
              key: const ValueKey('add-document'),
              onPressed: () => _add(context, ref),
              icon: const Icon(LucideIcons.plus),
              label: const Text('Add document'),
            )
          : null,
      body: switch (docs) {
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(myDocumentsProvider.future),
          child: ListView(
            padding: const EdgeInsets.only(bottom: 96),
            children: [
              const _PrivacyNote(),
              if (value.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(SajhaSpacing.lg),
                  child: Text(
                    'No documents yet. Add a government ID, or a college or '
                    'employee ID. Once we approve it, you get the ID '
                    'verified badge.',
                    textAlign: TextAlign.center,
                  ),
                ),
              for (final doc in value)
                _DocumentTile(
                  doc: doc,
                  onTap: () => _actions(context, ref, doc),
                ),
            ],
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
                onPressed: () => ref.invalidate(myDocumentsProvider),
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

enum _Action { viewFront, viewBack, delete }

class _PrivacyNote extends StatelessWidget {
  const _PrivacyNote();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.all(SajhaSpacing.md),
      padding: const EdgeInsets.all(SajhaSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(SajhaRadius.lg),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(LucideIcons.lock, color: scheme.primary),
          const SizedBox(width: SajhaSpacing.sm),
          const Expanded(
            child: Text(
              'Documents are stored encrypted and only Nivra’s review team '
              'can see them. Later, you’ll choose when to share one with a '
              'lender for a booking.',
            ),
          ),
        ],
      ),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({required this.doc, required this.onTap});

  final UserDocument doc;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final expired = doc.status == DocumentStatus.approved && doc.isExpired();
    final (label, color, icon) = switch (doc.status) {
      _ when expired => ('Expired', SajhaColors.warning, LucideIcons.calendarX),
      DocumentStatus.pending => (
        'Under review',
        SajhaColors.info,
        LucideIcons.hourglass,
      ),
      DocumentStatus.approved => (
        'Approved',
        SajhaColors.success,
        LucideIcons.badgeCheck,
      ),
      DocumentStatus.rejected => (
        'Rejected',
        SajhaColors.danger,
        LucideIcons.circleX,
      ),
    };
    final reason = doc.status == DocumentStatus.rejected
        ? doc.rejectionReason
        : null;

    return ListTile(
      key: ValueKey('document-${doc.id}'),
      leading: const Icon(LucideIcons.idCard),
      title: Text(doc.title),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: SajhaSpacing.xs),
              Text(label, style: TextStyle(color: color)),
            ],
          ),
          if (reason != null) Text(reason),
          if (doc.status == DocumentStatus.rejected)
            const Text('Delete it and add a clearer photo.'),
        ],
      ),
      isThreeLine: reason != null,
      trailing: const Icon(LucideIcons.ellipsisVertical),
      onTap: onTap,
    );
  }
}
