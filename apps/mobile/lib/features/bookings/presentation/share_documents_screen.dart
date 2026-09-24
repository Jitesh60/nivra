import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../documents/data/models.dart';
import '../../documents/presentation/documents_screen.dart'
    show myDocumentsProvider;
import '../application/bookings_providers.dart';
import '../data/models.dart';

/// The borrower picks a vault document for each one the lender asks for,
/// agrees to share them for this booking only, and sends them.
class ShareDocumentsScreen extends ConsumerStatefulWidget {
  const ShareDocumentsScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  ConsumerState<ShareDocumentsScreen> createState() =>
      _ShareDocumentsScreenState();
}

class _ShareDocumentsScreenState extends ConsumerState<ShareDocumentsScreen> {
  /// Required document id → chosen vault document id.
  final _chosen = <String, String>{};
  bool _consent = false;
  bool _sending = false;

  /// Vault documents that can be shared for [r]: the right type, not
  /// rejected by Sajha, and not expired.
  List<UserDocument> _options(BookingRequiredDoc r, List<UserDocument> docs) =>
      [
        for (final d in docs)
          if (d.isLive && !d.isExpired() && r.acceptsType(d.type)) d,
      ];

  Future<void> _send(BookingDetail detail) async {
    setState(() => _sending = true);
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    try {
      await ref.read(bookingProvider(widget.bookingId).notifier).shareDocuments(
        {for (final r in detail.requiredDocs) r.id: _chosen[r.id]!},
      );
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            'Shared with ${detail.booking.other.firstName}. We’ll tell you when they reply.',
          ),
        ),
      );
      router.pop();
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(bookingProvider(widget.bookingId));
    final docs = ref.watch(myDocumentsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Share documents')),
      body: switch ((detail, docs)) {
        (AsyncData(value: final d), AsyncData(value: final vault)) => _body(
          d,
          vault,
        ),
        (AsyncError(:final error), _) ||
        (_, AsyncError(:final error)) => Center(
          child: Text(
            error is ApiException
                ? error.friendlyMessage
                : 'Something went wrong.',
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _body(BookingDetail d, List<UserDocument> vault) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final lender = d.booking.other.firstName;
    // Pick the first match by default (verified ones first).
    for (final r in d.requiredDocs) {
      final options = _options(r, vault)
        ..sort(
          (a, b) => (b.status == DocumentStatus.approved ? 1 : 0).compareTo(
            a.status == DocumentStatus.approved ? 1 : 0,
          ),
        );
      if (!_chosen.containsKey(r.id) && options.isNotEmpty) {
        _chosen[r.id] = options.first.id;
      }
    }
    final ready =
        d.requiredDocs.every((r) => _chosen.containsKey(r.id)) && _consent;

    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        Text('$lender asks for:', style: text.titleMedium),
        const SizedBox(height: SajhaSpacing.sm),
        for (final r in d.requiredDocs) ...[
          Text(r.title, style: text.titleSmall),
          Text(r.type.hint, style: text.bodySmall?.copyWith(color: muted)),
          ...() {
            final options = _options(r, vault);
            if (options.isEmpty) {
              return [
                Padding(
                  padding: const EdgeInsets.symmetric(
                    vertical: SajhaSpacing.sm,
                  ),
                  child: OutlinedButton.icon(
                    key: ValueKey('add-document-${r.id}'),
                    onPressed: () async {
                      await context.push(Routes.documentsAdd);
                      ref.invalidate(myDocumentsProvider);
                    },
                    icon: const Icon(Icons.add),
                    label: const Text('Add a document'),
                  ),
                ),
              ];
            }
            return [
              RadioGroup<String>(
                groupValue: _chosen[r.id],
                onChanged: (v) => setState(() => _chosen[r.id] = v!),
                child: Column(
                  children: [
                    for (final doc in options)
                      RadioListTile<String>(
                        key: ValueKey('pick-${doc.id}'),
                        contentPadding: EdgeInsets.zero,
                        value: doc.id,
                        title: Text(doc.title),
                        subtitle: Text(
                          doc.status == DocumentStatus.approved
                              ? 'Verified by Sajha'
                              : 'Waiting for Sajha to verify',
                        ),
                      ),
                  ],
                ),
              ),
            ];
          }(),
          const SizedBox(height: SajhaSpacing.md),
        ],
        const Divider(),
        CheckboxListTile(
          key: const ValueKey('share-consent'),
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _consent,
          onChanged: (v) => setState(() => _consent = v ?? false),
          title: Text(
            'Share these with $lender for this booking only. They can view '
            'them (not download) until the booking ends, and I’ll see each '
            'time they’re opened.',
          ),
        ),
        const SizedBox(height: SajhaSpacing.md),
        FilledButton(
          key: const ValueKey('share-submit'),
          onPressed: ready && !_sending ? () => _send(d) : null,
          child: Text(_sending ? 'Sharing…' : 'Share documents'),
        ),
      ],
    );
  }
}
