import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/verify_email_dialog.dart';
import '../../chat/data/chat_repository.dart';
import '../../chat/data/models.dart' show ReportTarget;
import '../../chat/presentation/chat_format.dart' show ParticipantAvatar;
import '../../chat/presentation/report_sheet.dart';
import '../../listings/data/listings_repository.dart';
import '../../listings/data/models.dart';
import '../../settings/presentation/settings_screen.dart' show confirm;
import '../application/requests_providers.dart';
import '../data/models.dart';
import '../data/requests_repository.dart';
import 'request_tile.dart';

/// Closes [request] after asking; true when it was closed.
Future<bool> closeRequest(
  BuildContext context,
  WidgetRef ref,
  ItemRequest request,
) async {
  final ok = await confirm(
    context,
    title: 'Close this request?',
    body: 'Lenders won’t see it any more. Chats you’ve started stay open.',
    action: 'Close request',
  );
  if (!ok || !context.mounted) return false;
  final messenger = ScaffoldMessenger.of(context);
  try {
    await ref.read(requestsRepositoryProvider).close(request.id);
    ref
      ..invalidate(myRequestsProvider)
      ..invalidate(requestProvider(request.id));
    messenger.showSnackBar(const SnackBar(content: Text('Request closed')));
    return true;
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    return false;
  }
}

/// One request: what's needed, by whom, and the offers (all of them on your
/// own request; yours on someone else's).
class RequestScreen extends ConsumerStatefulWidget {
  const RequestScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<RequestScreen> createState() => _RequestScreenState();
}

class _RequestScreenState extends ConsumerState<RequestScreen> {
  bool _busy = false;

  Future<void> _offer(ItemRequest r) async {
    final offer =
        await showModalBottomSheet<({String listingId, String message})>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => OfferItemSheet(request: r),
        );
    if (offer == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() => _busy = true);
    try {
      final detail = await ref
          .read(requestsRepositoryProvider)
          .respond(r.id, listingId: offer.listingId, message: offer.message);
      ref.invalidate(requestProvider(r.id));
      ref.invalidate(requestBoardProvider);
      final response =
          detail.responses
              .where((x) => x.listing?.id == offer.listingId)
              .firstOrNull ??
          detail.responses.firstOrNull;
      messenger.showSnackBar(
        SnackBar(
          content: Text('Offer sent. Chat with ${r.borrower.firstName} here.'),
        ),
      );
      if (response != null) router.push(Routes.chat(response.conversationId));
    } on ApiException catch (e) {
      if (e.code == 'VERIFICATION_REQUIRED' && mounted) {
        await askToVerifyEmail(
          context,
          why:
              'To keep chats safe, everyone chatting on Sajha has a '
              'verified phone and email.',
        );
      } else {
        messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _report(ItemRequest r) async {
    final draft = await showReportSheet(context, title: 'Report this request');
    if (draft == null || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(chatRepositoryProvider)
          .report(
            target: ReportTarget.request,
            targetId: r.id,
            reason: draft.reason,
            note: draft.note,
          );
      messenger.showSnackBar(
        const SnackBar(content: Text('Thanks. Sajha will look into it.')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(requestProvider(widget.id));
    final r = detail.value?.request;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Request'),
        actions: [
          if (r != null && (!r.mine || r.status == RequestStatus.open))
            PopupMenuButton<String>(
              key: const ValueKey('request-menu'),
              tooltip: 'More',
              onSelected: (action) => action == 'report'
                  ? _report(r)
                  : closeRequest(context, ref, r),
              itemBuilder: (_) => [
                if (r.mine)
                  const PopupMenuItem(
                    key: ValueKey('request-close'),
                    value: 'close',
                    child: Text('Close request'),
                  )
                else
                  const PopupMenuItem(
                    key: ValueKey('request-report'),
                    value: 'report',
                    child: Text('Report'),
                  ),
              ],
            ),
        ],
      ),
      body: switch (detail) {
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(requestProvider(widget.id).future),
          child: _body(value),
        ),
        AsyncError(:final error) => Center(
          child: Padding(
            padding: const EdgeInsets.all(SajhaSpacing.xl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException
                      ? error.friendlyMessage
                      : 'Couldn’t load this request.',
                  textAlign: TextAlign.center,
                ),
                TextButton(
                  onPressed: () => ref.invalidate(requestProvider(widget.id)),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }

  Widget _body(ItemRequestDetail d) {
    final r = d.request;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final terms = requestTerms(r);
    final open = r.status == RequestStatus.open;
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        Text(r.title, style: text.headlineSmall),
        if (!open) ...[
          const SizedBox(height: SajhaSpacing.xs),
          Text(
            r.status.label,
            key: const ValueKey('request-status'),
            style: text.labelLarge?.copyWith(color: SajhaColors.danger),
          ),
        ],
        const SizedBox(height: SajhaSpacing.sm),
        Text(r.details, style: text.bodyLarge),
        const SizedBox(height: SajhaSpacing.md),
        for (final (icon, line) in [
          (Icons.place_outlined, r.placeLine),
          if (r.category case final c?) (Icons.category_outlined, c.name),
          if (terms != null) (Icons.event_outlined, terms),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: SajhaSpacing.xs),
            child: Row(
              children: [
                Icon(icon, size: 18, color: muted),
                const SizedBox(width: SajhaSpacing.sm),
                Expanded(child: Text(line)),
              ],
            ),
          ),
        const Divider(height: SajhaSpacing.xl),
        if (!r.mine) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: ParticipantAvatar(person: r.borrower),
            title: Row(
              children: [
                Flexible(child: Text(r.borrower.displayName)),
                if (r.borrower.idVerified) ...[
                  const SizedBox(width: SajhaSpacing.xs),
                  const Icon(
                    Icons.verified,
                    size: 16,
                    color: SajhaColors.brand600,
                    semanticLabel: 'ID verified',
                  ),
                ],
              ],
            ),
            subtitle: const Text('Looking to borrow'),
          ),
          const SizedBox(height: SajhaSpacing.sm),
          if (open)
            FilledButton.icon(
              key: const ValueKey('offer-item'),
              onPressed: _busy ? null : () => _offer(r),
              icon: const Icon(Icons.volunteer_activism_outlined),
              label: Text(
                r.answeredByMe ? 'Offer another item' : 'Offer your item',
              ),
            ),
          if (d.responses.isNotEmpty) ...[
            const SizedBox(height: SajhaSpacing.lg),
            Text('Your offers', style: text.titleSmall),
            for (final x in d.responses) ResponseTile(response: x, mine: true),
          ],
        ] else ...[
          Text(
            d.responses.isEmpty ? 'Offers' : 'Offers (${d.responses.length})',
            style: text.titleSmall,
          ),
          if (d.responses.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: SajhaSpacing.sm),
              child: Text(
                open
                    ? 'No offers yet. We’ve told lenders nearby.'
                    : 'No offers.',
                style: TextStyle(color: muted),
              ),
            ),
          for (final x in d.responses) ResponseTile(response: x),
          if (open) ...[
            const SizedBox(height: SajhaSpacing.md),
            OutlinedButton(
              key: const ValueKey('close-request'),
              onPressed: () => closeRequest(context, ref, r),
              child: const Text('Close request'),
            ),
          ],
        ],
      ],
    );
  }
}

/// An offer on a request. Opens the chat it started.
class ResponseTile extends StatelessWidget {
  const ResponseTile({required this.response, this.mine = false, super.key});

  final RequestResponse response;

  /// Your own offer (shown on someone else's request).
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final x = response;
    final listing = x.listing;
    return ListTile(
      key: ValueKey('response-${x.id}'),
      contentPadding: EdgeInsets.zero,
      leading: ParticipantAvatar(person: x.lender),
      title: Text(
        [
          if (!mine) x.lender.firstName,
          listing == null
              ? 'Listing removed'
              : '${listing.title} · ${formatRupees(listing.pricePerDayPaise)}/day',
        ].join(' · '),
      ),
      subtitle: Text(x.message, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: const Icon(Icons.chat_bubble_outline),
      onTap: () => context.push(Routes.chat(x.conversationId)),
    );
  }
}

/// Pick one of your live listings and add a note for the borrower.
class OfferItemSheet extends ConsumerStatefulWidget {
  const OfferItemSheet({required this.request, super.key});

  final ItemRequest request;

  @override
  ConsumerState<OfferItemSheet> createState() => _OfferItemSheetState();
}

class _OfferItemSheetState extends ConsumerState<OfferItemSheet> {
  String? _listingId;
  final _message = TextEditingController();

  @override
  void initState() {
    super.initState();
    _message.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final listings = ref.watch(myListingsProvider);
    final text = Theme.of(context).textTheme;
    final ready = _listingId != null && _message.text.trim().isNotEmpty;

    return Padding(
      padding: EdgeInsets.fromLTRB(
        SajhaSpacing.lg,
        0,
        SajhaSpacing.lg,
        SajhaSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          key: const ValueKey('offer-sheet'),
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Offer your item', style: text.titleLarge),
            const SizedBox(height: SajhaSpacing.xs),
            Text(
              '${widget.request.borrower.firstName} gets your note in a chat, '
              'where you can agree dates and price.',
            ),
            const SizedBox(height: SajhaSpacing.sm),
            ...switch (listings) {
              AsyncData(:final value) => () {
                final live = [
                  for (final l in value)
                    if (l.status == ListingStatus.live) l,
                ];
                if (live.isEmpty) {
                  return [
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: SajhaSpacing.md),
                      child: Text(
                        'You don’t have a live listing to offer yet.',
                        key: ValueKey('offer-no-listings'),
                      ),
                    ),
                    FilledButton.tonal(
                      onPressed: () {
                        final router = GoRouter.of(context);
                        Navigator.pop(context);
                        router.push(Routes.newListing);
                      },
                      child: const Text('List an item'),
                    ),
                  ];
                }
                return [
                  for (final l in live)
                    ListTile(
                      key: ValueKey('offer-listing-${l.id}'),
                      contentPadding: EdgeInsets.zero,
                      leading: Icon(
                        _listingId == l.id
                            ? Icons.radio_button_checked
                            : Icons.radio_button_unchecked,
                        color: _listingId == l.id ? SajhaColors.brand600 : null,
                      ),
                      title: Text(l.title),
                      subtitle: Text('${formatRupees(l.pricePerDayPaise)}/day'),
                      onTap: () => setState(() => _listingId = l.id),
                    ),
                  TextField(
                    key: const ValueKey('offer-message'),
                    controller: _message,
                    maxLength: 500,
                    minLines: 1,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'A note for them',
                      hintText: 'e.g. Mine fits four and is free that week.',
                    ),
                  ),
                  const SizedBox(height: SajhaSpacing.sm),
                  FilledButton(
                    key: const ValueKey('send-offer'),
                    onPressed: ready
                        ? () => Navigator.pop(context, (
                            listingId: _listingId!,
                            message: _message.text.trim(),
                          ))
                        : null,
                    child: const Text('Send offer'),
                  ),
                ];
              }(),
              AsyncError(:final error) => [
                Text(
                  error is ApiException
                      ? error.friendlyMessage
                      : 'Couldn’t load your listings.',
                ),
              ],
              _ => [
                const Padding(
                  padding: EdgeInsets.all(SajhaSpacing.lg),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ],
            },
          ],
        ),
      ),
    );
  }
}
