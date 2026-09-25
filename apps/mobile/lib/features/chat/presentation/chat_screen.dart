import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/media/photo_picker.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show formatRupees;
import '../application/chat_controller.dart';
import '../data/models.dart';
import 'chat_format.dart';
import 'offer_sheet.dart';
import 'report_sheet.dart';

/// One chat: messages, offers, and the report / block menu.
class ChatScreen extends ConsumerWidget {
  const ChatScreen({required this.conversationId, super.key});

  final String conversationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chat = ref.watch(chatControllerProvider(conversationId));
    return switch (chat) {
      AsyncData(:final value) => _ChatView(
        state: value,
        conversationId: conversationId,
      ),
      AsyncError(:final error) => Scaffold(
        appBar: AppBar(),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Something went wrong.',
                key: const ValueKey('chat-error'),
              ),
              TextButton(
                onPressed: () =>
                    ref.invalidate(chatControllerProvider(conversationId)),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
      ),
      _ => Scaffold(
        appBar: AppBar(),
        body: const Center(child: CircularProgressIndicator()),
      ),
    };
  }
}

/// Runs a chat action, showing a friendly message if the API refuses it.
Future<bool> _attempt(
  BuildContext context,
  Future<void> Function() action,
) async {
  final messenger = ScaffoldMessenger.of(context);
  try {
    await action();
    return true;
  } on ApiException catch (e) {
    messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    return false;
  }
}

class _ChatView extends ConsumerStatefulWidget {
  const _ChatView({required this.state, required this.conversationId});

  final ChatState state;
  final String conversationId;

  @override
  ConsumerState<_ChatView> createState() => _ChatViewState();
}

class _ChatViewState extends ConsumerState<_ChatView> {
  final _text = TextEditingController();

  ChatController get _chat =>
      ref.read(chatControllerProvider(widget.conversationId).notifier);

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _text.text;
    if (text.trim().isEmpty) return;
    _text.clear();
    await _attempt(context, () => _chat.sendText(text));
  }

  Future<void> _sendPhoto() async {
    final photo = await ref.read(photoPickerProvider).pick(PhotoSource.gallery);
    if (photo == null || !mounted) return;
    await _attempt(context, () => _chat.sendPhoto(photo));
  }

  Future<void> _offer({Offer? counterTo}) async {
    final draft = await showOfferSheet(
      context,
      listing: widget.state.conversation.listing,
      counterTo: counterTo,
    );
    if (draft == null || !mounted) return;
    await _attempt(
      context,
      () => counterTo == null
          ? _chat.makeOffer(draft.start, draft.end, draft.pricePerDayPaise)
          : _chat.counter(
              counterTo,
              draft.start,
              draft.end,
              draft.pricePerDayPaise,
            ),
    );
  }

  Future<void> _report(
    ReportTarget target,
    String targetId,
    String title,
  ) async {
    final draft = await showReportSheet(context, title: title);
    if (draft == null || !mounted) return;
    final ok = await _attempt(
      context,
      () => _chat.report(target, targetId, draft.reason, draft.note),
    );
    if (ok && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Thanks. Our team will take a look.')),
      );
    }
  }

  Future<void> _toggleBlock() async {
    final c = widget.state.conversation;
    if (c.blockedByMe) {
      await _attempt(context, _chat.unblock);
      return;
    }
    final sure = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Block ${c.other.firstName}?'),
        content: const Text(
          'You won’t get messages or offers from each other. You can unblock later.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const ValueKey('confirm-block'),
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Block'),
          ),
        ],
      ),
    );
    if (sure ?? false) {
      if (mounted) await _attempt(context, _chat.block);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.state;
    final c = s.conversation;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: InkWell(
          key: const ValueKey('chat-header'),
          onTap: () => context.push(Routes.item(c.listing.id)),
          child: Row(
            children: [
              ParticipantAvatar(person: c.other, radius: 18),
              const SizedBox(width: SajhaSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            c.other.displayName,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (c.other.idVerified) ...[
                          const SizedBox(width: 4),
                          const Icon(
                            LucideIcons.badgeCheck,
                            size: 16,
                            color: SajhaColors.brand600,
                          ),
                        ],
                      ],
                    ),
                    Text(
                      c.listing.title,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall
                          ?.copyWith(color: muted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          PopupMenuButton<String>(
            key: const ValueKey('chat-menu'),
            onSelected: (v) => switch (v) {
              'report' => _report(
                ReportTarget.user,
                c.other.id,
                'Report ${c.other.firstName}',
              ),
              'block' => _toggleBlock(),
              _ => null,
            },
            itemBuilder: (_) => [
              PopupMenuItem(
                key: const ValueKey('menu-report'),
                value: 'report',
                child: Text('Report ${c.other.firstName}'),
              ),
              PopupMenuItem(
                key: const ValueKey('menu-block'),
                value: 'block',
                child: Text(c.blockedByMe ? 'Unblock' : 'Block'),
              ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (c.openBookingId != null)
            _DealBanner(offer: c.acceptedOffer, bookingId: c.openBookingId!),
          Expanded(
            child: NotificationListener<ScrollNotification>(
              onNotification: (n) {
                if (n.metrics.extentAfter < 300) _chat.loadOlder().ignore();
                return false;
              },
              child: ListView.builder(
                key: const ValueKey('chat-messages'),
                reverse: true,
                padding: const EdgeInsets.all(SajhaSpacing.md),
                itemCount: s.messages.length + 1,
                itemBuilder: (_, i) {
                  if (i == s.messages.length) {
                    return s.olderCursor == null
                        ? _ChatStart(conversation: c)
                        : const Padding(
                            padding: EdgeInsets.all(SajhaSpacing.md),
                            child: Center(child: CircularProgressIndicator()),
                          );
                  }
                  final m = s.messages[i];
                  return _MessageItem(
                    message: m,
                    conversation: c,
                    onRetry: m.clientId == null
                        ? null
                        : () =>
                              _attempt(context, () => _chat.retry(m.clientId!)),
                    onReport: () => _report(
                      ReportTarget.message,
                      m.id,
                      'Report this message',
                    ),
                    onAccept: (o) => _attempt(context, () => _chat.accept(o)),
                    onDecline: (o) => _attempt(context, () => _chat.decline(o)),
                    onCounter: (o) => _offer(counterTo: o),
                  );
                },
              ),
            ),
          ),
          if (s.otherTyping)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: SajhaSpacing.md),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${c.other.firstName} is typing…',
                  key: const ValueKey('typing'),
                  style: TextStyle(color: muted, fontStyle: FontStyle.italic),
                ),
              ),
            ),
          if (c.canMessage)
            _Composer(
              controller: _text,
              onChanged: (_) => _chat.typing(),
              onSend: _send,
              onPhoto: _sendPhoto,
              onOffer: c.pendingOffer?.answerable ?? false
                  ? () => _offer(counterTo: c.pendingOffer)
                  : () => _offer(),
            )
          else
            _BlockedNotice(
              conversation: c,
              onUnblock: () => _attempt(context, _chat.unblock),
            ),
        ],
      ),
    );
  }
}

class _ChatStart extends StatelessWidget {
  const _ChatStart({required this.conversation});
  final Conversation conversation;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: SajhaSpacing.lg),
    child: Text(
      conversation.isBorrower
          ? 'Ask ${conversation.other.firstName} about dates, pickup and the price. '
                'Contact details stay hidden until a booking is confirmed.'
          : '${conversation.other.firstName} is asking about your listing. '
                'Contact details stay hidden until a booking is confirmed.',
      textAlign: TextAlign.center,
      style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
    ),
  );
}

/// The booking in progress for this chat (from a request or an agreed deal).
class _DealBanner extends StatelessWidget {
  const _DealBanner({required this.offer, required this.bookingId});
  final Offer? offer;
  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final o = offer;
    return Material(
      key: const ValueKey('deal-banner'),
      color: SajhaColors.brand50,
      child: ListTile(
        leading: const Icon(LucideIcons.handshake, color: SajhaColors.brand700),
        title: Text(
          o == null
              ? 'Booking in progress'
              : 'Deal agreed: ${offerDates(o)} · ${formatRupees(o.pricePerDayPaise)}/day',
        ),
        subtitle: const Text('See what happens next'),
        trailing: TextButton(
          key: const ValueKey('open-booking'),
          onPressed: () => context.push(Routes.booking(bookingId)),
          child: const Text('Open booking'),
        ),
        onTap: () => context.push(Routes.booking(bookingId)),
      ),
    );
  }
}

class _BlockedNotice extends StatelessWidget {
  const _BlockedNotice({required this.conversation, required this.onUnblock});
  final Conversation conversation;
  final VoidCallback onUnblock;

  @override
  Widget build(BuildContext context) => SafeArea(
    top: false,
    child: Padding(
      key: const ValueKey('blocked-notice'),
      padding: const EdgeInsets.all(SajhaSpacing.md),
      child: Row(
        children: [
          Expanded(
            child: Text(
              conversation.blockedByMe
                  ? 'You blocked ${conversation.other.firstName}.'
                  : 'You can’t reply to this chat.',
            ),
          ),
          if (conversation.blockedByMe)
            TextButton(
              key: const ValueKey('unblock'),
              onPressed: onUnblock,
              child: const Text('Unblock'),
            ),
        ],
      ),
    ),
  );
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.onChanged,
    required this.onSend,
    required this.onPhoto,
    required this.onOffer,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  final VoidCallback onSend;
  final VoidCallback onPhoto;
  final VoidCallback onOffer;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: SajhaSpacing.xs,
            vertical: SajhaSpacing.xs,
          ),
          child: Row(
            children: [
              IconButton(
                key: const ValueKey('send-photo'),
                tooltip: 'Send a photo',
                onPressed: onPhoto,
                icon: const Icon(LucideIcons.image),
              ),
              IconButton(
                key: const ValueKey('make-offer'),
                tooltip: 'Make an offer',
                onPressed: onOffer,
                icon: const Icon(LucideIcons.tag),
              ),
              Expanded(
                child: TextField(
                  key: const ValueKey('chat-input'),
                  controller: controller,
                  onChanged: onChanged,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: 2000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    hintText: 'Message',
                    counterText: '',
                    isDense: true,
                  ),
                  onSubmitted: (_) => onSend(),
                ),
              ),
              IconButton(
                key: const ValueKey('send-message'),
                tooltip: 'Send',
                onPressed: onSend,
                icon: const Icon(LucideIcons.send, color: SajhaColors.brand600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MessageItem extends StatelessWidget {
  const _MessageItem({
    required this.message,
    required this.conversation,
    required this.onRetry,
    required this.onReport,
    required this.onAccept,
    required this.onDecline,
    required this.onCounter,
  });

  final ChatMessage message;
  final Conversation conversation;
  final VoidCallback? onRetry;
  final VoidCallback onReport;
  final ValueChanged<Offer> onAccept;
  final ValueChanged<Offer> onDecline;
  final ValueChanged<Offer> onCounter;

  @override
  Widget build(BuildContext context) {
    final m = message;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    if (m.type == MessageType.system) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: SajhaSpacing.sm),
        child: Text(
          m.body ?? '',
          key: ValueKey('system-${m.id}'),
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(color: muted),
        ),
      );
    }
    if (m.type == MessageType.offer && m.offer != null) {
      return _OfferCard(
        offer: m.offer!,
        conversation: conversation,
        onAccept: onAccept,
        onDecline: onDecline,
        onCounter: onCounter,
      );
    }
    return _Bubble(
      message: m,
      other: conversation.other,
      onRetry: onRetry,
      onReport: onReport,
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.message,
    required this.other,
    required this.onRetry,
    required this.onReport,
  });

  final ChatMessage message;
  final ChatParticipant other;
  final VoidCallback? onRetry;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    final m = message;
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final bg = m.mine ? SajhaColors.brand600 : scheme.surfaceContainerHighest;
    final fg = m.mine ? Colors.white : scheme.onSurface;
    final metaColor = m.mine ? Colors.white70 : scheme.onSurfaceVariant;

    Widget content;
    if (m.type == MessageType.image) {
      final Widget image = m.localImage != null
          ? Image.memory(
              m.localImage!,
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const Icon(LucideIcons.image),
            )
          : Image.network(
              m.thumbUrl ?? '',
              fit: BoxFit.cover,
              errorBuilder: (_, _, _) => const Icon(LucideIcons.imageOff),
            );
      content = GestureDetector(
        onTap: m.imageUrl == null
            ? null
            : () => showDialog<void>(
                context: context,
                builder: (_) => Dialog(
                  child: InteractiveViewer(child: Image.network(m.imageUrl!)),
                ),
              ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(SajhaRadius.md),
          child: SizedBox(width: 200, height: 150, child: image),
        ),
      );
    } else {
      content = Text(m.body ?? '', style: TextStyle(color: fg));
    }

    final bubble = Container(
      key: ValueKey('message-${m.clientId ?? m.id}'),
      margin: const EdgeInsets.symmetric(vertical: 3),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      constraints: BoxConstraints(
        maxWidth: MediaQuery.sizeOf(context).width * 0.75,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(SajhaRadius.lg),
      ),
      child: Column(
        crossAxisAlignment: m.mine
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          content,
          const SizedBox(height: 2),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                chatTime(m.createdAt),
                style: text.labelSmall?.copyWith(color: metaColor),
              ),
              if (m.mine) ...[
                const SizedBox(width: 4),
                _Ticks(message: m, color: metaColor),
              ],
            ],
          ),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: m.mine
          ? CrossAxisAlignment.end
          : CrossAxisAlignment.start,
      children: [
        GestureDetector(onLongPress: m.mine ? null : onReport, child: bubble),
        if (m.masked)
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  LucideIcons.lock,
                  size: 12,
                  color: scheme.onSurfaceVariant,
                ),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    m.mine
                        ? 'Contact details hidden from ${other.firstName} until you book'
                        : 'Contact details are hidden until a booking is confirmed',
                    key: ValueKey('masked-note-${m.id}'),
                    style: text.labelSmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ],
            ),
          ),
        if (m.sendState == SendState.failed)
          TextButton.icon(
            key: ValueKey('retry-${m.clientId}'),
            onPressed: onRetry,
            icon: const Icon(
              LucideIcons.circleAlert,
              color: SajhaColors.danger,
              size: 16,
            ),
            label: const Text('Not sent. Tap to retry'),
          ),
      ],
    );
  }
}

class _Ticks extends StatelessWidget {
  const _Ticks({required this.message, required this.color});
  final ChatMessage message;
  final Color color;

  @override
  Widget build(BuildContext context) => switch (message.sendState) {
    SendState.sending => Icon(LucideIcons.clock, size: 14, color: color),
    SendState.failed => const Icon(
      LucideIcons.circleAlert,
      size: 14,
      color: Colors.white,
    ),
    SendState.sent when message.readAt != null => Icon(
      LucideIcons.checkCheck,
      size: 14,
      color: SajhaColors.accent200,
      semanticLabel: 'Read',
      key: ValueKey('read-${message.id}'),
    ),
    SendState.sent => Icon(
      LucideIcons.check,
      size: 14,
      color: color,
      semanticLabel: 'Sent',
    ),
  };
}

class _OfferCard extends StatelessWidget {
  const _OfferCard({
    required this.offer,
    required this.conversation,
    required this.onAccept,
    required this.onDecline,
    required this.onCounter,
  });

  final Offer offer;
  final Conversation conversation;
  final ValueChanged<Offer> onAccept;
  final ValueChanged<Offer> onDecline;
  final ValueChanged<Offer> onCounter;

  @override
  Widget build(BuildContext context) {
    final o = offer;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    Widget line(String label, String value, {bool bold = false}) => Row(
      children: [
        Expanded(child: Text(label)),
        Text(
          value,
          style: bold ? const TextStyle(fontWeight: FontWeight.w700) : null,
        ),
      ],
    );
    final (statusText, statusColor) = switch (o.status) {
      OfferStatus.pending => (
        o.mine ? 'Waiting for a reply' : 'Your reply needed',
        SajhaColors.warning,
      ),
      OfferStatus.accepted => ('Accepted', SajhaColors.success),
      OfferStatus.countered => ('Countered', SajhaColors.ink500),
      OfferStatus.declined => ('Declined', SajhaColors.danger),
      OfferStatus.expired => ('Expired', SajhaColors.ink500),
      OfferStatus.superseded => (
        'Replaced by a newer deal',
        SajhaColors.ink500,
      ),
    };

    return Align(
      alignment: o.mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Card(
        key: ValueKey('offer-${o.id}'),
        margin: const EdgeInsets.symmetric(vertical: SajhaSpacing.xs),
        child: SizedBox(
          width: 280,
          child: Padding(
            padding: const EdgeInsets.all(SajhaSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.tag, size: 18),
                    const SizedBox(width: SajhaSpacing.xs),
                    Expanded(
                      child: Text(
                        o.mine
                            ? 'Your offer'
                            : '${conversation.other.firstName}’s offer',
                        style: text.titleSmall,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: SajhaSpacing.xs),
                Text(
                  '${offerDates(o)} · ${o.days} ${o.days == 1 ? 'day' : 'days'}',
                  style: TextStyle(color: muted),
                ),
                const SizedBox(height: SajhaSpacing.sm),
                line(
                  '${formatRupees(o.pricePerDayPaise)} × ${o.days}',
                  formatRupees(o.rentPaise),
                ),
                line('Refundable deposit', formatRupees(o.depositPaise)),
                const Divider(),
                line('Total', formatRupees(o.totalPaise), bold: true),
                const SizedBox(height: SajhaSpacing.sm),
                Text(
                  statusText,
                  key: ValueKey('offer-status-${o.id}'),
                  style: TextStyle(
                    color: statusColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (o.status == OfferStatus.accepted)
                  Text(
                    'Deal agreed. The booking has the next steps.',
                    style: TextStyle(color: muted),
                  ),
                if (o.answerable && conversation.canMessage) ...[
                  const SizedBox(height: SajhaSpacing.sm),
                  Wrap(
                    alignment: WrapAlignment.end,
                    spacing: SajhaSpacing.xs,
                    runSpacing: SajhaSpacing.xs,
                    children: [
                      TextButton(
                        key: const ValueKey('offer-decline'),
                        onPressed: () => onDecline(o),
                        child: const Text('Decline'),
                      ),
                      OutlinedButton(
                        key: const ValueKey('offer-counter'),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 40),
                        ),
                        onPressed: () => onCounter(o),
                        child: const Text('Counter'),
                      ),
                      FilledButton(
                        key: const ValueKey('offer-accept'),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 40),
                        ),
                        onPressed: () => onAccept(o),
                        child: const Text('Accept'),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
