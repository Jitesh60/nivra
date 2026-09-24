import 'dart:async';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/realtime_client.dart';
import '../../discovery/application/discovery_providers.dart';
import '../data/chat_repository.dart';
import '../data/models.dart';
import 'inbox.dart';

class ChatState {
  const ChatState({
    required this.conversation,
    required this.messages,
    this.olderCursor,
    this.loadingOlder = false,
    this.otherTyping = false,
  });

  final Conversation conversation;

  /// Newest first (the list is drawn bottom-up).
  final List<ChatMessage> messages;
  final String? olderCursor;
  final bool loadingOlder;
  final bool otherTyping;

  ChatState copyWith({
    Conversation? conversation,
    List<ChatMessage>? messages,
    String? Function()? olderCursor,
    bool? loadingOlder,
    bool? otherTyping,
  }) => ChatState(
    conversation: conversation ?? this.conversation,
    messages: messages ?? this.messages,
    olderCursor: olderCursor != null ? olderCursor() : this.olderCursor,
    loadingOlder: loadingOlder ?? this.loadingOlder,
    otherTyping: otherTyping ?? this.otherTyping,
  );
}

/// One open chat: messages (paged), sends that show at once and can be
/// retried, live events, read receipts and the offer actions. Actions throw
/// `ApiException` for the screen to show.
class ChatController extends AsyncNotifier<ChatState> {
  ChatController(this.conversationId);

  final String conversationId;
  final _pending = <String, Future<ChatMessage> Function()>{};
  Timer? _typingTimer;
  DateTime _lastTypingSent = DateTime.fromMillisecondsSinceEpoch(0);

  ChatRepository get _repo => ref.read(chatRepositoryProvider);

  @override
  Future<ChatState> build() async {
    final sub = ref
        .watch(realtimeClientProvider)
        .events
        .where((e) => e.conversationId == conversationId)
        .listen(_onEvent);
    ref.onDispose(() {
      sub.cancel();
      _typingTimer?.cancel();
    });
    final results = await Future.wait([
      _repo.conversation(conversationId),
      _repo.messages(conversationId),
    ]);
    final conversation = results[0] as Conversation;
    final page = results[1] as Page<ChatMessage>;
    final loaded = ChatState(
      conversation: conversation,
      messages: page.items,
      olderCursor: page.nextCursor,
    );
    unawaited(Future.microtask(() => _markRead(loaded.messages)));
    return loaded;
  }

  Future<void> loadOlder() async {
    final s = state.value;
    if (s == null || s.olderCursor == null || s.loadingOlder) return;
    state = AsyncData(s.copyWith(loadingOlder: true));
    try {
      final page = await _repo.messages(conversationId, before: s.olderCursor);
      final now = state.value!;
      state = AsyncData(
        now.copyWith(
          messages: [...now.messages, ...page.items],
          olderCursor: () => page.nextCursor,
          loadingOlder: false,
        ),
      );
    } catch (_) {
      state = AsyncData(state.value!.copyWith(loadingOlder: false));
      rethrow;
    }
  }

  Future<void> sendText(String text) {
    final body = text.trim();
    if (body.isEmpty) return Future.value();
    final clientId = newClientId();
    return _send(
      ChatMessage(
        id: 'local-$clientId',
        conversationId: conversationId,
        senderId: '',
        mine: true,
        type: MessageType.text,
        body: body,
        masked: false,
        clientId: clientId,
        createdAt: DateTime.now(),
        sendState: SendState.sending,
      ),
      () => _repo.sendText(conversationId, body, clientId),
    );
  }

  Future<void> sendPhoto(Uint8List photo) {
    final clientId = newClientId();
    return _send(
      ChatMessage(
        id: 'local-$clientId',
        conversationId: conversationId,
        senderId: '',
        mine: true,
        type: MessageType.image,
        masked: false,
        clientId: clientId,
        createdAt: DateTime.now(),
        sendState: SendState.sending,
        localImage: photo,
      ),
      () => _repo.sendPhoto(conversationId, photo, clientId),
    );
  }

  /// Sends a failed message again (same clientId, so it's stored once).
  Future<void> retry(String clientId) async {
    final call = _pending[clientId];
    if (call == null) return;
    _setSendState(clientId, SendState.sending);
    await _deliver(clientId, call);
  }

  /// Tells the other person you're typing (at most every 2 s).
  void typing() {
    final now = DateTime.now();
    if (now.difference(_lastTypingSent) < const Duration(seconds: 2)) return;
    _lastTypingSent = now;
    ref.read(realtimeClientProvider).typing(conversationId);
  }

  Future<void> makeOffer(
    DateTime start,
    DateTime end,
    int pricePerDayPaise,
  ) async {
    _upsert(
      await _repo.makeOffer(
        conversationId,
        start: start,
        end: end,
        pricePerDayPaise: pricePerDayPaise,
      ),
    );
    await _refreshConversation();
  }

  Future<void> counter(
    Offer offer,
    DateTime start,
    DateTime end,
    int pricePerDayPaise,
  ) async {
    _upsert(
      await _repo.counter(
        offer.id,
        start: start,
        end: end,
        pricePerDayPaise: pricePerDayPaise,
      ),
    );
    await _refreshLatest();
  }

  Future<void> accept(Offer offer) async {
    _updateOffer(await _repo.accept(offer.id));
    await _refreshLatest();
  }

  Future<void> decline(Offer offer) async {
    _updateOffer(await _repo.decline(offer.id));
    await _refreshLatest();
  }

  Future<void> block() async {
    await _repo.block(state.value!.conversation.other.id);
    await _refreshConversation();
  }

  Future<void> unblock() async {
    await _repo.unblock(state.value!.conversation.other.id);
    await _refreshConversation();
  }

  Future<void> report(
    ReportTarget target,
    String targetId,
    ReportReason reason,
    String? note,
  ) => _repo.report(
    target: target,
    targetId: targetId,
    reason: reason,
    note: note,
    conversationId: conversationId,
  );

  // ─── internals ──────────────────────────────────────────────────────────

  Future<void> _send(
    ChatMessage local,
    Future<ChatMessage> Function() call,
  ) async {
    _pending[local.clientId!] = call;
    _insertNewest(local);
    await _deliver(local.clientId!, call);
  }

  Future<void> _deliver(
    String clientId,
    Future<ChatMessage> Function() call,
  ) async {
    try {
      final sent = await call();
      _pending.remove(clientId);
      _upsert(sent);
    } catch (_) {
      _setSendState(clientId, SendState.failed);
      rethrow;
    }
  }

  void _onEvent(RealtimeEvent e) {
    final s = state.value;
    if (s == null) return;
    switch (e.name) {
      case RealtimeEvents.messageNew:
        final m = ChatMessage.fromJson(e.data);
        _upsert(m);
        if (!m.mine) {
          _typingTimer?.cancel();
          state = AsyncData(state.value!.copyWith(otherTyping: false));
          unawaited(_markRead([m]));
        }
        if (m.type == MessageType.offer || m.type == MessageType.system) {
          unawaited(_refreshConversation());
        }
      case RealtimeEvents.messageRead:
        if (e.data['readerId'] == s.conversation.other.id) {
          final upTo = e.data['upTo'] as String;
          final at = DateTime.parse(e.data['readAt'] as String);
          state = AsyncData(
            s.copyWith(
              messages: [
                for (final m in s.messages)
                  m.mine &&
                          m.readAt == null &&
                          !m.id.startsWith('local-') &&
                          m.id.compareTo(upTo) <= 0
                      ? m.copyWith(readAt: at)
                      : m,
              ],
            ),
          );
        }
      case RealtimeEvents.offerUpdated:
        _updateOffer(Offer.fromJson(e.data));
        unawaited(_refreshConversation());
      case RealtimeEvents.typing:
        if (e.data['userId'] == s.conversation.other.id) {
          _typingTimer?.cancel();
          state = AsyncData(s.copyWith(otherTyping: true));
          _typingTimer = Timer(const Duration(seconds: 4), () {
            final now = state.value;
            if (now != null) {
              state = AsyncData(now.copyWith(otherTyping: false));
            }
          });
        }
    }
  }

  /// Marks the other person's newest unread message (and all before it) read.
  Future<void> _markRead(List<ChatMessage> messages) async {
    final newestUnread = messages
        .where((m) => !m.mine && m.readAt == null)
        .firstOrNull;
    if (newestUnread == null) return;
    try {
      await _repo.markRead(conversationId, newestUnread.id);
      ref.invalidate(unreadCountProvider);
    } catch (_) {
      // Harmless: it'll be marked next time.
    }
  }

  void _insertNewest(ChatMessage m) {
    final s = state.value;
    if (s != null) {
      state = AsyncData(s.copyWith(messages: [m, ...s.messages]));
    }
  }

  /// Adds or replaces a message (matching a pending send by clientId).
  void _upsert(ChatMessage m) {
    final s = state.value;
    if (s == null) return;
    final list = [...s.messages];
    final i = list.indexWhere(
      (x) =>
          x.id == m.id ||
          (m.clientId != null && x.clientId == m.clientId && x.mine),
    );
    if (i >= 0) {
      list[i] = m;
    } else {
      list.insert(0, m);
    }
    state = AsyncData(s.copyWith(messages: list));
  }

  void _updateOffer(Offer offer) {
    final s = state.value;
    if (s == null) return;
    state = AsyncData(
      s.copyWith(
        messages: [
          for (final m in s.messages)
            m.offer?.id == offer.id ? m.copyWith(offer: offer) : m,
        ],
      ),
    );
  }

  void _setSendState(String clientId, SendState sendState) {
    final s = state.value;
    if (s == null) return;
    state = AsyncData(
      s.copyWith(
        messages: [
          for (final m in s.messages)
            m.clientId == clientId && m.mine
                ? m.copyWith(sendState: sendState)
                : m,
        ],
      ),
    );
  }

  Future<void> _refreshConversation() async {
    final c = await _repo.conversation(conversationId);
    final s = state.value;
    if (s != null) {
      state = AsyncData(s.copyWith(conversation: c));
    }
  }

  /// Picks up messages the socket may not have delivered (e.g. system notes).
  Future<void> _refreshLatest() async {
    final page = await _repo.messages(conversationId);
    for (final m in page.items.reversed) {
      _upsert(m);
    }
    await _refreshConversation();
  }
}

final chatControllerProvider = AsyncNotifierProvider.autoDispose
    .family<ChatController, ChatState, String>(
      ChatController.new,
      retry: noRetry,
    );

final _random = Random.secure();

/// An id for a message the app is sending, so a retry isn't stored twice.
String newClientId() => List.generate(
  16,
  (_) => _random.nextInt(256).toRadixString(16).padLeft(2, '0'),
).join();
