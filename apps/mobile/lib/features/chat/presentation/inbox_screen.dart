import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/inbox.dart';
import '../data/models.dart';
import 'chat_format.dart';

/// Every chat, most recent first, with unread counts.
class InboxScreen extends ConsumerWidget {
  const InboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(inboxProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Chats')),
      body: switch (inbox) {
        AsyncData(:final value) when value.items.isEmpty => const _Empty(),
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(inboxProvider.future),
          child: NotificationListener<ScrollNotification>(
            onNotification: (n) {
              if (n.metrics.extentAfter < 400) {
                ref.read(inboxProvider.notifier).loadMore();
              }
              return false;
            },
            child: ListView.separated(
              key: const ValueKey('inbox-list'),
              itemCount: value.items.length,
              separatorBuilder: (_, _) => const Divider(height: 1, indent: 88),
              itemBuilder: (_, i) =>
                  _ConversationTile(conversation: value.items[i]),
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
                    : 'Something went wrong.',
              ),
              TextButton(
                onPressed: () => ref.invalidate(inboxProvider),
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

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation});
  final Conversation conversation;

  @override
  Widget build(BuildContext context) {
    final c = conversation;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final unread = c.unreadCount > 0;
    return ListTile(
      key: ValueKey('conversation-${c.id}'),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: SajhaSpacing.md,
        vertical: 6,
      ),
      onTap: () => context.push(Routes.chat(c.id)),
      leading: SizedBox(
        width: 56,
        height: 56,
        child: Stack(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(SajhaRadius.md),
              child: SizedBox.square(
                dimension: 48,
                child: c.listing.thumbUrl == null
                    ? const ColoredBox(
                        color: SajhaColors.ink100,
                        child: Icon(LucideIcons.image),
                      )
                    : Image.network(
                        c.listing.thumbUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            const ColoredBox(color: SajhaColors.ink100),
                      ),
              ),
            ),
            Positioned(
              right: 0,
              bottom: 0,
              child: ParticipantAvatar(person: c.other, radius: 12),
            ),
          ],
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              c.other.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: text.titleSmall?.copyWith(
                fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ),
          Text(
            chatTime(c.lastMessageAt),
            style: text.bodySmall?.copyWith(color: muted),
          ),
        ],
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            c.listing.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: text.bodySmall,
          ),
          Row(
            children: [
              Expanded(
                child: Text(
                  c.lastMessagePreview ?? 'Say hello',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: unread ? null : muted,
                    fontWeight: unread ? FontWeight.w600 : null,
                  ),
                ),
              ),
              if (unread)
                Badge(
                  key: ValueKey('unread-${c.id}'),
                  label: Text('${c.unreadCount}'),
                  backgroundColor: SajhaColors.brand600,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => Center(
    key: const ValueKey('inbox-empty'),
    child: Padding(
      padding: const EdgeInsets.all(SajhaSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            LucideIcons.messageCircle,
            size: 48,
            color: SajhaColors.ink400,
          ),
          const SizedBox(height: SajhaSpacing.md),
          Text('No chats yet', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: SajhaSpacing.xs),
          const Text(
            'Open something you’d like to rent and tap Chat to ask the lender.',
            textAlign: TextAlign.center,
          ),
        ],
      ),
    ),
  );
}
