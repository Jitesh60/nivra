part of 'fake_api.dart';

/// Chat state kept by [FakeSajhaApi].
class FakeChat {
  final conversations = <String, FakeConversation>{};
  final blocks = <String>{}; // "blocker|blocked"
  final reports = <Map<String, dynamic>>[];
  final pushTokens = <String, String>{}; // token → platform

  /// The next [n] message sends fail with a network-style 503.
  int failNextSends = 0;
}

class FakeConversation {
  FakeConversation(this.id, this.listingId, this.borrowerId, this.lenderId);
  final String id;
  final String listingId;
  final String borrowerId;
  final String lenderId;
  DateTime lastMessageAt = DateTime.utc(2026, 9, 24, 10);
  String? preview;
  final messages = <FakeMessage>[]; // oldest first
  final offers = <FakeOffer>[];

  String other(String userId) => userId == borrowerId ? lenderId : borrowerId;
}

class FakeMessage {
  FakeMessage({
    required this.id,
    required this.senderId,
    required this.type,
    required this.createdAt,
    this.body,
    this.maskedBody,
    this.masked = false,
    this.offerId,
    this.clientId,
    this.imageKey,
  });
  final String id;
  final String senderId;
  final String type;
  final String? body;
  final String? maskedBody;
  final bool masked;
  final String? offerId;
  final String? clientId;
  final String? imageKey;
  final DateTime createdAt;
  DateTime? readAt;
}

class FakeOffer {
  FakeOffer({
    required this.id,
    required this.proposedById,
    required this.start,
    required this.end,
    required this.price,
    required this.deposit,
    this.parentId,
  });
  final String id;
  final String proposedById;
  final String start;
  final String end;
  final int price;
  final int deposit;
  final String? parentId;
  String status = 'PENDING';

  int get days =>
      DateTime.parse(end).difference(DateTime.parse(start)).inDays + 1;
}

/// Phone numbers and emails, like the API's masking (simplified).
(String, bool) fakeMask(String text) {
  var masked = false;
  final out = text
      .replaceAllMapped(RegExp(r'(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}'), (_) {
        masked = true;
        return '•••';
      })
      .replaceAllMapped(RegExp(r'[\w.+-]+@[\w-]+(\.[\w-]+)*'), (_) {
        masked = true;
        return '•••';
      });
  return (out, masked);
}

extension FakeChatApi on FakeSajhaApi {
  // ─── Helpers for tests ────────────────────────────────────────────────────

  /// A chat about [listingId] started by [borrowerId].
  FakeConversation seedConversation(String borrowerId, String listingId) {
    final l = listings[listingId]!;
    final c = FakeConversation(
      'conv-${++_seq}',
      listingId,
      borrowerId,
      l.lenderId,
    );
    chat.conversations[c.id] = c;
    return c;
  }

  /// The other person writes (and the app gets it live if connected).
  FakeMessage sendAs(String userId, String conversationId, String text) {
    final c = chat.conversations[conversationId]!;
    final (masked, hidden) = fakeMask(text);
    return _post(
      c,
      FakeMessage(
        id: _msgId(),
        senderId: userId,
        type: 'TEXT',
        body: text,
        maskedBody: masked,
        masked: hidden,
        createdAt: DateTime.now().toUtc(),
      ),
    );
  }

  /// The other person makes an offer.
  FakeOffer offerAs(
    String userId,
    String conversationId, {
    required String start,
    required String end,
    required int pricePerDayPaise,
  }) {
    final c = chat.conversations[conversationId]!;
    return _newOffer(c, userId, start, end, pricePerDayPaise, null);
  }

  /// The other person reads everything so far.
  void readAs(String userId, String conversationId) {
    final c = chat.conversations[conversationId]!;
    final now = DateTime.now().toUtc();
    FakeMessage? last;
    for (final m in c.messages) {
      if (m.senderId != userId && m.readAt == null) {
        m.readAt = now;
        last = m;
      }
    }
    if (last == null) return;
    for (final u in [c.borrowerId, c.lenderId]) {
      onRealtime?.call(u, 'message:read', {
        'conversationId': c.id,
        'readerId': userId,
        'upTo': last.id,
        'readAt': now.toIso8601String(),
      });
    }
  }

  void typingAs(String userId, String conversationId) => onRealtime?.call(
    chat.conversations[conversationId]!.other(userId),
    'typing',
    {'conversationId': conversationId, 'userId': userId},
  );

  // ─── Endpoints ───────────────────────────────────────────────────────────

  (int, Object?)? _chat(
    String method,
    String path,
    Map<String, dynamic> body,
    Map<String, String> query,
    _User user,
  ) {
    final parts = path.split('/'); // ['', 'conversations', id, ...]
    switch ('$method $path') {
      case 'POST /conversations':
        if (!user.emailVerified) {
          return _error(403, 'VERIFICATION_REQUIRED', 'Verify', {
            'missing': ['email'],
          });
        }
        final l = listings[body['listingId']];
        if (l == null || l.status != 'LIVE') {
          return _error(404, 'NOT_FOUND', 'Listing not found');
        }
        if (l.lenderId == user.id) {
          return _error(400, 'CONVERSATION_NOT_ALLOWED', 'Own listing');
        }
        final existing = chat.conversations.values
            .where((c) => c.listingId == l.id && c.borrowerId == user.id)
            .firstOrNull;
        return (
          200,
          _conversationJson(
            existing ?? seedConversation(user.id, l.id),
            user.id,
          ),
        );
      case 'GET /conversations':
        final mine =
            chat.conversations.values
                .where(
                  (c) =>
                      c.borrowerId == user.id ||
                      (c.lenderId == user.id && c.preview != null),
                )
                .toList()
              ..sort((a, b) => b.lastMessageAt.compareTo(a.lastMessageAt));
        return (
          200,
          {
            'items': [for (final c in mine) _conversationJson(c, user.id)],
            'nextCursor': null,
          },
        );
      case 'GET /me/unread':
        final unread = [
          for (final c in chat.conversations.values)
            if (c.borrowerId == user.id || c.lenderId == user.id)
              c.messages
                  .where((m) => m.senderId != user.id && m.readAt == null)
                  .length,
        ].where((n) => n > 0);
        return (
          200,
          {
            'conversations': unread.length,
            'messages': unread.fold(0, (a, b) => a + b),
            'notifications': notificationsFor(user.id)
                .where((n) => n.readAt == null)
                .length,
          },
        );
      case 'PUT /me/devices/push-token':
        chat.pushTokens[body['token'] as String] = body['platform'] as String;
        return (204, null);
      case 'POST /reports':
        chat.reports.add({...body, 'reporterId': user.id});
        return (201, {'id': 'report-${++_seq}', 'status': 'OPEN'});
    }

    if (path.startsWith('/me/blocks/')) {
      final key = '${user.id}|${parts.last}';
      if (method == 'PUT') chat.blocks.add(key);
      if (method == 'DELETE') chat.blocks.remove(key);
      return (204, null);
    }

    if (path.startsWith('/offers/')) {
      final offerId = parts[2];
      final c = chat.conversations.values
          .where((c) => c.offers.any((o) => o.id == offerId))
          .firstOrNull;
      if (c == null || (c.borrowerId != user.id && c.lenderId != user.id)) {
        return _error(404, 'NOT_FOUND', 'Offer not found');
      }
      final o = c.offers.firstWhere((o) => o.id == offerId);
      if (o.status != 'PENDING') {
        return _error(409, 'OFFER_NOT_PENDING', 'Answered', {
          'status': o.status,
        });
      }
      if (o.proposedById == user.id) {
        return _error(403, 'OFFER_OWN', 'Own offer');
      }
      switch (parts[3]) {
        case 'counter':
          final counter = _newOffer(
            c,
            user.id,
            body['startDate'] as String,
            body['endDate'] as String,
            body['pricePerDayPaise'] as int,
            o.id,
          );
          return (201, _messageJson(c, c.messages.last, user.id, counter));
        case 'accept':
          for (final a in c.offers.where((x) => x.status == 'ACCEPTED')) {
            a.status = 'SUPERSEDED';
          }
          if (bookingState.bookings.values.any(
            (b) => b.conversationId == c.id && b.open,
          )) {
            return _error(
              409,
              'BOOKING_OPEN_EXISTS',
              'You already have a booking in progress for this item.',
            );
          }
          o.status = 'ACCEPTED';
          _announce(c, o);
          final booking = _bookingFromOffer(c, o, user.id);
          _system(
            c,
            user.id,
            'Offer accepted: ${o.start} – ${o.end} at ₹${o.price ~/ 100}/day. '
            '${booking.status == 'AWAITING_DOCS' ? 'Booking created: waiting for the borrower to share documents.' : 'Booking created: the dates are held for payment.'}',
          );
          return (200, _offerJson(o, c, user.id));
        case 'decline':
          o.status = 'DECLINED';
          _announce(c, o);
          _system(c, user.id, 'Offer declined');
          return (200, _offerJson(o, c, user.id));
      }
    }

    if (parts.length >= 3 && parts[1] == 'conversations') {
      final c = chat.conversations[parts[2]];
      if (c == null || (c.borrowerId != user.id && c.lenderId != user.id)) {
        return _error(404, 'NOT_FOUND', 'Conversation not found');
      }
      final action = parts.skip(3).join('/');
      final blocked =
          chat.blocks.contains('${user.id}|${c.other(user.id)}') ||
          chat.blocks.contains('${c.other(user.id)}|${user.id}');
      switch ('$method $action') {
        case 'GET ':
          return (200, _conversationJson(c, user.id));
        case 'GET messages':
          final newestFirst = c.messages.reversed.toList();
          final before = query['before'];
          final start = before == null
              ? 0
              : newestFirst.indexWhere((m) => m.id == before) + 1;
          final page = newestFirst.skip(start).take(30).toList();
          return (
            200,
            {
              'items': [for (final m in page) _messageJson(c, m, user.id)],
              'nextCursor': start + page.length < newestFirst.length
                  ? page.last.id
                  : null,
            },
          );
        case 'POST messages':
          if (chat.failNextSends > 0) {
            chat.failNextSends--;
            return _error(503, 'SERVICE_UNAVAILABLE', 'Try again');
          }
          if (blocked) return _error(403, 'USER_BLOCKED', 'Blocked');
          final clientId = body['clientId'] as String;
          final again = c.messages
              .where((m) => m.senderId == user.id && m.clientId == clientId)
              .firstOrNull;
          if (again != null) return (201, _messageJson(c, again, user.id));
          final FakeMessage m;
          if (body['type'] == 'IMAGE') {
            if (_claim(user, body['key'], 'CHAT_IMAGE') == null) {
              return _error(400, 'UPLOAD_NOT_FOUND', 'Upload not found');
            }
            m = FakeMessage(
              id: _msgId(),
              senderId: user.id,
              type: 'IMAGE',
              clientId: clientId,
              imageKey: 'chat/${c.id}/${++_seq}',
              createdAt: DateTime.now().toUtc(),
            );
          } else {
            final text = (body['body'] as String).trim();
            final (masked, hidden) = fakeMask(text);
            m = FakeMessage(
              id: _msgId(),
              senderId: user.id,
              type: 'TEXT',
              body: text,
              maskedBody: masked,
              masked: hidden,
              clientId: clientId,
              createdAt: DateTime.now().toUtc(),
            );
          }
          _post(c, m);
          return (201, _messageJson(c, m, user.id));
        case 'POST read':
          final upTo = body['upTo'] as String;
          final now = DateTime.now().toUtc();
          var changed = false;
          for (final m in c.messages) {
            if (m.senderId != user.id &&
                m.readAt == null &&
                m.id.compareTo(upTo) <= 0) {
              m.readAt = now;
              changed = true;
            }
          }
          if (changed) {
            for (final u in [c.borrowerId, c.lenderId]) {
              onRealtime?.call(u, 'message:read', {
                'conversationId': c.id,
                'readerId': user.id,
                'upTo': upTo,
                'readAt': now.toIso8601String(),
              });
            }
          }
          return (204, null);
        case 'POST offers':
          if (blocked) return _error(403, 'USER_BLOCKED', 'Blocked');
          final o = _newOffer(
            c,
            user.id,
            body['startDate'] as String,
            body['endDate'] as String,
            body['pricePerDayPaise'] as int,
            null,
          );
          return (201, _messageJson(c, c.messages.last, user.id, o));
      }
    }
    return null;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /// Sortable like the API's uuid7 ids.
  String _msgId() => 'msg-${(++_seq).toString().padLeft(6, '0')}';

  FakeMessage _post(FakeConversation c, FakeMessage m) {
    c.messages.add(m);
    c.lastMessageAt = m.createdAt;
    c.preview = switch (m.type) {
      'TEXT' => m.maskedBody,
      'IMAGE' => '📷 Photo',
      'OFFER' => 'Offer',
      _ => m.body,
    };
    for (final u in [c.borrowerId, c.lenderId]) {
      onRealtime?.call(u, 'message:new', _messageJson(c, m, u));
    }
    return m;
  }

  void _system(FakeConversation c, String actorId, String text) => _post(
    c,
    FakeMessage(
      id: _msgId(),
      senderId: actorId,
      type: 'SYSTEM',
      body: text,
      createdAt: DateTime.now().toUtc(),
    ),
  );

  FakeOffer _newOffer(
    FakeConversation c,
    String userId,
    String start,
    String end,
    int price,
    String? parentId,
  ) {
    for (final open in c.offers.where((o) => o.status == 'PENDING')) {
      open.status = 'COUNTERED';
      _announce(c, open);
    }
    final o = FakeOffer(
      id: 'offer-${++_seq}',
      proposedById: userId,
      start: start,
      end: end,
      price: price,
      deposit: listings[c.listingId]!.fields['depositPaise'] as int,
      parentId: parentId,
    );
    c.offers.add(o);
    _post(
      c,
      FakeMessage(
        id: _msgId(),
        senderId: userId,
        type: 'OFFER',
        offerId: o.id,
        createdAt: DateTime.now().toUtc(),
      ),
    );
    return o;
  }

  void _announce(FakeConversation c, FakeOffer o) {
    for (final u in [c.borrowerId, c.lenderId]) {
      onRealtime?.call(u, 'offer:updated', _offerJson(o, c, u));
    }
  }

  Map<String, dynamic> _offerJson(
    FakeOffer o,
    FakeConversation c,
    String viewerId,
  ) => {
    'id': o.id,
    'conversationId': c.id,
    'proposedById': o.proposedById,
    'mine': o.proposedById == viewerId,
    'startDate': o.start,
    'endDate': o.end,
    'days': o.days,
    'pricePerDayPaise': o.price,
    'rentPaise': o.price * o.days,
    'depositPaise': o.deposit,
    'totalPaise': o.price * o.days + o.deposit,
    'status': o.status,
    'parentOfferId': o.parentId,
    'expiresAt': '2099-01-01T00:00:00.000Z',
    'createdAt': '2026-09-24T10:00:00.000Z',
  };

  Map<String, dynamic> _messageJson(
    FakeConversation c,
    FakeMessage m,
    String viewerId, [
    FakeOffer? offer,
  ]) {
    final mine = m.senderId == viewerId;
    final o = offer ?? c.offers.where((x) => x.id == m.offerId).firstOrNull;
    return {
      'id': m.id,
      'conversationId': c.id,
      'senderId': m.senderId,
      'mine': mine,
      'type': m.type,
      'body': m.type == 'TEXT' ? (mine ? m.body : m.maskedBody) : m.body,
      'masked': m.masked,
      'imageUrl': m.imageKey == null
          ? null
          : 'http://${FakeSajhaApi.storageHost}/${m.imageKey}.webp',
      'thumbUrl': m.imageKey == null
          ? null
          : 'http://${FakeSajhaApi.storageHost}/${m.imageKey}-thumb.webp',
      'offer': o == null ? null : _offerJson(o, c, viewerId),
      'clientId': mine ? m.clientId : null,
      'readAt': m.readAt?.toIso8601String(),
      'createdAt': m.createdAt.toIso8601String(),
    };
  }

  Map<String, dynamic> _conversationJson(FakeConversation c, String viewerId) {
    final l = listings[c.listingId]!;
    final other = _users[c.other(viewerId)]!;
    final pending = c.offers.where((o) => o.status == 'PENDING').firstOrNull;
    final accepted = c.offers.where((o) => o.status == 'ACCEPTED').firstOrNull;
    final byMe = chat.blocks.contains('$viewerId|${other.id}');
    final byThem = chat.blocks.contains('${other.id}|$viewerId');
    return {
      'id': c.id,
      'listing': {
        'id': l.id,
        'title': l.title,
        'thumbUrl': l.photos.firstOrNull?['thumbUrl'],
        'status': l.status,
        'pricePerDayPaise': l.fields['pricePerDayPaise'],
        'depositPaise': l.fields['depositPaise'],
        'minDays': l.fields['minDays'] ?? 1,
        'maxDays': l.fields['maxDays'] ?? 30,
      },
      'role': c.borrowerId == viewerId ? 'BORROWER' : 'LENDER',
      'other': {
        'id': other.id,
        'name': other.name,
        'avatarUrl': other.avatarUrl,
        'idVerified': other.json['idVerified'],
      },
      'lastMessageAt': c.lastMessageAt.toIso8601String(),
      'lastMessagePreview': c.preview,
      'unreadCount': c.messages
          .where((m) => m.senderId != viewerId && m.readAt == null)
          .length,
      'blockedByMe': byMe,
      'canMessage': !byMe && !byThem,
      'pendingOffer': pending == null ? null : _offerJson(pending, c, viewerId),
      'acceptedOffer': accepted == null
          ? null
          : _offerJson(accepted, c, viewerId),
      'openBookingId': _openBookingId(c),
    };
  }
}
