part of 'fake_api.dart';

/// Booking state kept by [FakeSajhaApi] (the rules are a simplified copy of
/// the API's `booking-rules.ts`).
class FakeBookings {
  final bookings = <String, FakeBooking>{};
  final notifications = <FakeNotification>[]; // oldest first
}

class FakeBooking {
  FakeBooking({
    required this.id,
    required this.listingId,
    required this.borrowerId,
    required this.lenderId,
    required this.conversationId,
    required this.start,
    required this.end,
    required this.price,
    required this.rent,
    required this.deposit,
    required this.status,
    this.fromOffer = false,
  });
  final String id;
  final String listingId;
  final String borrowerId;
  final String lenderId;
  final String conversationId;
  final String start;
  final String end;
  final int price;
  final int rent;
  final int deposit;
  final bool fromOffer;
  String status;
  DateTime? expiresAt = DateTime.now().toUtc().add(const Duration(hours: 24));
  String? declineReason;
  String? cancelledBy;
  String? cancelReason;
  final events = <Map<String, dynamic>>[];
  final shares = <FakeShare>[];

  int get days =>
      DateTime.parse(end).difference(DateTime.parse(start)).inDays + 1;

  bool get open =>
      !const {'DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED'}.contains(status);
}

class FakeShare {
  FakeShare(this.id, this.requiredDocId, this.document);
  final String id;
  final String requiredDocId;
  final FakeDocument document;
  String status = 'SUBMITTED';
  final views = <DateTime>[];
}

class FakeNotification {
  FakeNotification(
    this.id,
    this.userId,
    this.type,
    this.title,
    this.body,
    this.bookingId,
  );
  final String id;
  final String userId;
  final String type;
  final String title;
  final String body;
  final String? bookingId;
  final createdAt = DateTime.now().toUtc();
  DateTime? readAt;

  Map<String, dynamic> get json => {
    'id': id,
    'type': type,
    'title': title,
    'body': body,
    'bookingId': bookingId,
    'readAt': readAt?.toIso8601String(),
    'createdAt': createdAt.toIso8601String(),
  };
}

const _govIds = [
  'AADHAAR_MASKED',
  'PAN',
  'DRIVING_LICENCE',
  'PASSPORT',
  'VOTER_ID',
];
const _accepts = {
  'GOVERNMENT_ID': _govIds,
  'COLLEGE_OR_EMPLOYEE_ID': ['COLLEGE_ID', 'EMPLOYEE_ID'],
  'ADDRESS_PROOF': [
    'ADDRESS_PROOF',
    'AADHAAR_MASKED',
    'DRIVING_LICENCE',
    'PASSPORT',
    'VOTER_ID',
  ],
  'OTHER': <String>[],
};

extension FakeBookingsApi on FakeSajhaApi {
  // ─── Helpers for tests ────────────────────────────────────────────────────

  /// Makes [listingId] ask for these documents (e.g. `['GOVERNMENT_ID']`).
  void requireDocs(String listingId, List<String> types) =>
      listings[listingId]!.requiredDocs = [
        for (final t in types)
          {'docType': t, 'note': t == 'OTHER' ? 'Trek permit' : null},
      ];

  /// A booking request by [borrowerId], as if made on another device.
  FakeBooking seedBooking(
    String borrowerId,
    String listingId, {
    required String start,
    required String end,
    String status = 'REQUESTED',
  }) {
    final l = listings[listingId]!;
    final c =
        chat.conversations.values
            .where(
              (c) => c.listingId == listingId && c.borrowerId == borrowerId,
            )
            .firstOrNull ??
        seedConversation(borrowerId, listingId);
    final price = l.fields['pricePerDayPaise'] as int;
    final b = FakeBooking(
      id: 'booking-${(++_seq).toString().padLeft(6, '0')}-4f2a9c',
      listingId: listingId,
      borrowerId: borrowerId,
      lenderId: l.lenderId,
      conversationId: c.id,
      start: start,
      end: end,
      price: price,
      rent:
          price *
          (DateTime.parse(end).difference(DateTime.parse(start)).inDays + 1),
      deposit: l.fields['depositPaise'] as int,
      status: status,
    );
    bookingState.bookings[b.id] = b;
    _event(b, 'REQUESTED', borrowerId);
    return b;
  }

  /// A document in [userId]'s vault.
  FakeDocument seedDocument(
    String userId,
    String type, {
    bool approved = true,
  }) {
    final doc = FakeDocument('doc-${++_seq}', userId, type)
      ..status = approved ? 'APPROVED' : 'PENDING';
    documents[doc.id] = doc;
    return doc;
  }

  /// [borrowerId] sends a booking request from their own phone.
  FakeBooking requestAs(
    String borrowerId,
    String listingId, {
    required String start,
    required String end,
  }) {
    final (status, json) = _bookings(
      'POST',
      '/bookings',
      {'listingId': listingId, 'startDate': start, 'endDate': end},
      const {},
      _users[borrowerId]!,
    )!;
    assert(status == 201, 'request failed: $json');
    return bookingState.bookings[(json! as Map)['id']]!;
  }

  /// Someone else acts on a booking (the lender accepting, the borrower
  /// sharing documents…); the app sees it live if connected.
  (int, Object?) bookingActAs(
    String userId,
    String bookingId,
    String action, [
    Map<String, dynamic> body = const {},
  ]) => _bookings(
    'POST',
    '/bookings/$bookingId/$action',
    body,
    const {},
    _users[userId]!,
  )!;

  /// The booking's step times out.
  void expireBooking(String bookingId) {
    final b = bookingState.bookings[bookingId]!;
    _move(b, 'EXPIRED', 'EXPIRED', null);
    for (final u in [b.borrowerId, b.lenderId]) {
      _notify(
        u,
        'booking.expired',
        'Booking expired',
        'Time ran out.',
        b.id,
        push: true,
      );
    }
  }

  List<FakeNotification> notificationsFor(String userId) => [
    for (final n in bookingState.notifications)
      if (n.userId == userId) n,
  ];

  // ─── Endpoints ───────────────────────────────────────────────────────────

  (int, Object?)? _bookings(
    String method,
    String path,
    Map<String, dynamic> body,
    Map<String, String> query,
    _User user,
  ) {
    switch ('$method $path') {
      case 'POST /bookings':
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
          return _error(400, 'BOOKING_OWN_LISTING', 'Own listing');
        }
        if (bookingState.bookings.values.any(
          (b) => b.listingId == l.id && b.borrowerId == user.id && b.open,
        )) {
          return _error(
            409,
            'BOOKING_OPEN_EXISTS',
            'You already have a booking in progress for this item.',
          );
        }
        final b = seedBooking(
          user.id,
          l.id,
          start: body['startDate'] as String,
          end: body['endDate'] as String,
        );
        _system(
          chat.conversations[b.conversationId]!,
          user.id,
          'Booking requested',
        );
        _notify(
          b.lenderId,
          'booking.requested',
          'New booking request',
          '${user.name?.split(' ').first ?? 'Someone'} wants ${l.title}.',
          b.id,
          push: true,
        );
        _updated(b);
        return (201, _bookingDetail(b, user.id));
      case 'GET /bookings':
        final borrower = query['role'] == 'BORROWER';
        final open = (query['scope'] ?? 'OPEN') == 'OPEN';
        final items =
            bookingState.bookings.values
                .where(
                  (b) =>
                      (borrower ? b.borrowerId : b.lenderId) == user.id &&
                      b.open == open,
                )
                .toList()
              ..sort((a, b) => b.id.compareTo(a.id));
        return (
          200,
          {
            'items': [for (final b in items) _bookingJson(b, user.id)],
            'nextCursor': null,
          },
        );
      case 'GET /me/notifications':
        final mine = notificationsFor(user.id).reversed.toList();
        return (
          200,
          {
            'items': [for (final n in mine) n.json],
            'nextCursor': null,
            'unread': mine.where((n) => n.readAt == null).length,
          },
        );
      case 'POST /me/notifications/read':
        final upTo = body['upTo'] as String?;
        for (final n in notificationsFor(user.id)) {
          if (n.readAt == null && (upTo == null || n.id.compareTo(upTo) <= 0)) {
            n.readAt = DateTime.now().toUtc();
          }
        }
        return (204, null);
    }

    final parts = path.split('/'); // ['', 'bookings', id, action...]
    if (parts.length < 3 || parts[1] != 'bookings') return null;
    final b = bookingState.bookings[parts[2]];
    if (b == null || (b.borrowerId != user.id && b.lenderId != user.id)) {
      return _error(404, 'NOT_FOUND', 'Booking not found');
    }
    final lender = b.lenderId == user.id;
    final action = parts.skip(3).join('/');
    final submitted = b.shares.any((s) => s.status == 'SUBMITTED');
    (int, Object?) conflict() => _error(
      409,
      'BOOKING_INVALID_TRANSITION',
      'This booking has moved on. Refresh to see where it is now.',
      {'status': b.status},
    );
    (int, Object?) notAllowed() =>
        _error(403, 'BOOKING_NOT_ALLOWED', 'Not allowed');
    final c = chat.conversations[b.conversationId]!;

    if (method == 'GET' && action == '') {
      return (200, _bookingDetail(b, user.id));
    }
    if (method == 'GET' && parts.length == 6 && parts[3] == 'documents') {
      final share = b.shares.where((s) => s.id == parts[4]).firstOrNull;
      if (share == null) return _error(404, 'NOT_FOUND', 'Document not found');
      if (!lender) return notAllowed();
      if (!b.open) {
        return _error(
          410,
          'DOCUMENT_ACCESS_ENDED',
          'Access to this document has ended',
        );
      }
      share.views.add(DateTime.now().toUtc());
      return (
        200,
        {
          'url':
              'http://${FakeSajhaApi.storageHost}/bookings/${b.id}/${share.id}-${query['side'] ?? 'front'}.jpg',
          'expiresAt': DateTime.now()
              .toUtc()
              .add(const Duration(minutes: 5))
              .toIso8601String(),
          'watermark':
              'Shared with ${_users[b.lenderId]!.name} for booking #4F2A9C · now',
        },
      );
    }
    if (method != 'POST') return null;
    switch (action) {
      case 'accept':
        if (!lender) return notAllowed();
        if (b.status != 'REQUESTED') return conflict();
        final docs = listings[b.listingId]!.requiredDocs.isNotEmpty;
        _move(
          b,
          docs ? 'AWAITING_DOCS' : 'AWAITING_PAYMENT',
          'ACCEPTED',
          user.id,
        );
        _system(c, user.id, 'Booking accepted.');
        _notify(
          b.borrowerId,
          'booking.accepted',
          'Booking accepted',
          'Your request was accepted.',
          b.id,
          push: true,
        );
        if (docs) {
          _notify(
            b.borrowerId,
            'booking.docs_requested',
            'Documents needed',
            'Share the documents.',
            b.id,
            push: false,
          );
        }
      case 'decline':
        if (!lender) return notAllowed();
        if (b.status != 'REQUESTED') return conflict();
        b.declineReason = (body['reason'] as String?)?.trim();
        _move(b, 'DECLINED', 'DECLINED', user.id, note: b.declineReason);
        _notify(
          b.borrowerId,
          'booking.declined',
          'Booking declined',
          'Declined.',
          b.id,
          push: true,
        );
      case 'cancel':
        final allowed = lender
            ? const {'AWAITING_DOCS', 'AWAITING_PAYMENT'}.contains(b.status)
            : const {
                'REQUESTED',
                'AWAITING_DOCS',
                'AWAITING_PAYMENT',
              }.contains(b.status);
        if (!allowed) return conflict();
        b
          ..cancelledBy = lender ? 'LENDER' : 'BORROWER'
          ..cancelReason = (body['reason'] as String).trim();
        _move(b, 'CANCELLED', 'CANCELLED', user.id, note: b.cancelReason);
        _notify(
          lender ? b.borrowerId : b.lenderId,
          'booking.cancelled',
          'Booking cancelled',
          'Cancelled.',
          b.id,
          push: true,
        );
      case 'documents':
        if (lender) return notAllowed();
        if (b.status != 'AWAITING_DOCS' || submitted) return conflict();
        final required = _requiredDocs(b);
        final choices = {
          for (final s in body['shares'] as List)
            (s as Map)['requiredDocId'] as String:
                s['userDocumentId'] as String,
        };
        for (final r in required) {
          final doc = documents[choices[r['id']]];
          final accepts = r['accepts'] as List;
          if (doc == null ||
              doc.userId != user.id ||
              doc.status == 'REJECTED' ||
              (accepts.isNotEmpty && !accepts.contains(doc.type))) {
            return _error(
              400,
              'BOOKING_DOCS_MISMATCH',
              'That document doesn’t match what the lender asks for',
            );
          }
          b.shares.add(FakeShare('share-${++_seq}', r['id'] as String, doc));
        }
        _move(b, 'AWAITING_DOCS', 'DOCS_SUBMITTED', user.id);
        _notify(
          b.lenderId,
          'booking.docs_submitted',
          'Documents shared',
          'Review them.',
          b.id,
          push: false,
        );
      case 'documents/approve':
        if (!lender) return notAllowed();
        if (b.status != 'AWAITING_DOCS' || !submitted) return conflict();
        for (final s in b.shares) {
          s.status = 'APPROVED';
        }
        _move(b, 'AWAITING_PAYMENT', 'DOCS_APPROVED', user.id);
        _notify(
          b.borrowerId,
          'booking.docs_approved',
          'Documents approved',
          'Approved.',
          b.id,
          push: false,
        );
      case 'documents/reject':
        if (!lender) return notAllowed();
        if (b.status != 'AWAITING_DOCS' || !submitted) return conflict();
        for (final s in b.shares) {
          s.status = 'REJECTED';
        }
        b.declineReason = (body['reason'] as String).trim();
        _move(b, 'DECLINED', 'DOCS_REJECTED', user.id, note: b.declineReason);
        _notify(
          b.borrowerId,
          'booking.declined',
          'Documents not accepted',
          'Declined.',
          b.id,
          push: true,
        );
      default:
        return null;
    }
    return (200, _bookingDetail(b, user.id));
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /// An accepted chat offer becomes an already-accepted booking.
  FakeBooking _bookingFromOffer(
    FakeConversation c,
    FakeOffer o,
    String acceptorId,
  ) {
    final docs = listings[c.listingId]!.requiredDocs.isNotEmpty;
    final b = FakeBooking(
      id: 'booking-${(++_seq).toString().padLeft(6, '0')}-4f2a9c',
      listingId: c.listingId,
      borrowerId: c.borrowerId,
      lenderId: c.lenderId,
      conversationId: c.id,
      start: o.start,
      end: o.end,
      price: o.price,
      rent: o.price * o.days,
      deposit: o.deposit,
      status: docs ? 'AWAITING_DOCS' : 'AWAITING_PAYMENT',
      fromOffer: true,
    );
    bookingState.bookings[b.id] = b;
    _event(b, 'ACCEPTED', acceptorId, note: 'Offer agreed in chat');
    _updated(b);
    return b;
  }

  String? _openBookingId(FakeConversation c) => bookingState.bookings.values
      .where((b) => b.conversationId == c.id && b.open)
      .map((b) => b.id)
      .lastOrNull;

  void _move(
    FakeBooking b,
    String to,
    String event,
    String? actorId, {
    String? note,
  }) {
    b.status = to;
    b.expiresAt = b.open
        ? DateTime.now().toUtc().add(
            Duration(hours: to == 'AWAITING_PAYMENT' ? 2 : 24),
          )
        : null;
    _event(b, event, actorId, note: note);
    _updated(b);
  }

  void _event(FakeBooking b, String type, String? actorId, {String? note}) =>
      b.events.add({
        'type': type,
        'status': b.status,
        'by': actorId == null
            ? 'SYSTEM'
            : actorId == b.borrowerId
            ? 'BORROWER'
            : 'LENDER',
        'note': note,
        'at': DateTime.now().toUtc().toIso8601String(),
      });

  void _updated(FakeBooking b) {
    for (final u in [b.borrowerId, b.lenderId]) {
      onRealtime?.call(u, 'booking:updated', _bookingJson(b, u));
    }
  }

  void _notify(
    String userId,
    String type,
    String title,
    String body,
    String bookingId, {
    required bool push,
  }) {
    final n = FakeNotification(
      'notif-${(++_seq).toString().padLeft(6, '0')}',
      userId,
      type,
      title,
      body,
      bookingId,
    );
    bookingState.notifications.add(n);
    onRealtime?.call(userId, 'notification:new', n.json);
  }

  List<Map<String, dynamic>> _requiredDocs(FakeBooking b) {
    final l = listings[b.listingId]!;
    return [
      for (final (i, d) in l.requiredDocs.indexed)
        {
          'id': 'req-${l.id}-$i',
          'docType': (d as Map)['docType'],
          'note': d['note'],
          'accepts': _accepts[d['docType']] ?? const <String>[],
        },
    ];
  }

  Map<String, dynamic> _bookingJson(FakeBooking b, String viewerId) {
    final l = listings[b.listingId]!;
    final other = _users[viewerId == b.borrowerId ? b.lenderId : b.borrowerId]!;
    return {
      'id': b.id,
      'status': b.status,
      'source': b.fromOffer ? 'OFFER' : 'REQUEST',
      'role': viewerId == b.borrowerId ? 'BORROWER' : 'LENDER',
      'listing': {
        'id': l.id,
        'title': l.title,
        'thumbUrl': l.photos.firstOrNull?['thumbUrl'],
        'areaLabel': l.fields['areaLabel'],
      },
      'other': {
        'id': other.id,
        'name': other.name,
        'avatarUrl': other.avatarUrl,
        'idVerified': other.json['idVerified'],
      },
      'conversationId': b.conversationId,
      'startDate': b.start,
      'endDate': b.end,
      'days': b.days,
      'pricePerDayPaise': b.price,
      'rentPaise': b.rent,
      'feePaise': 0,
      'depositPaise': b.deposit,
      'totalPaise': b.rent + b.deposit,
      'expiresAt': b.expiresAt?.toIso8601String(),
      'declineReason': b.declineReason,
      'cancelledBy': b.cancelledBy,
      'cancelReason': b.cancelReason,
      'createdAt': '2026-09-24T10:00:00.000Z',
      'updatedAt': '2026-09-24T10:00:00.000Z',
    };
  }

  Map<String, dynamic> _bookingDetail(FakeBooking b, String viewerId) {
    final borrower = viewerId == b.borrowerId;
    final submitted = b.shares.any((s) => s.status == 'SUBMITTED');
    final docs = listings[b.listingId]!.requiredDocs.isNotEmpty;
    bool cancel() => borrower
        ? const {
            'REQUESTED',
            'AWAITING_DOCS',
            'AWAITING_PAYMENT',
          }.contains(b.status)
        : const {'AWAITING_DOCS', 'AWAITING_PAYMENT'}.contains(b.status);
    return {
      ..._bookingJson(b, viewerId),
      'requiredDocs': docs ? _requiredDocs(b) : const [],
      'sharedDocuments': [
        for (final s in b.shares)
          {
            'id': s.id,
            'requiredDocId': s.requiredDocId,
            'docType': s.document.type,
            'label': s.document.label,
            'verified': s.document.status == 'APPROVED',
            'status': s.status,
            'hasBack': s.document.hasBack,
            'viewable': !borrower && b.open,
            'views': borrower
                ? [
                    for (final v in s.views)
                      {
                        'viewerName': _users[b.lenderId]!.name,
                        'at': v.toIso8601String(),
                      },
                  ]
                : const [],
          },
      ],
      'events': b.events,
      'can': {
        'accept': !borrower && b.status == 'REQUESTED',
        'decline': !borrower && b.status == 'REQUESTED',
        'cancel': cancel(),
        'shareDocs': borrower && b.status == 'AWAITING_DOCS' && !submitted,
        'reviewDocs': !borrower && b.status == 'AWAITING_DOCS' && submitted,
      },
    };
  }
}
