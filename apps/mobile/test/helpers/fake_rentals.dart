part of 'fake_api.dart';

/// The rental kept by [FakeSajhaApi] (a simplified copy of the API's rentals
/// module: codes, handover and return, disputes, reviews).
class FakeRental {
  DateTime? handedOverAt;
  DateTime? returnedAt;
  DateTime? completedAt;
  DateTime? noShowAt;
  int lateDays = 0;
  int lateFee = 0;
  int kept = 0;

  /// (stage, by user id) → photo keys.
  final reports = <(String, String), List<String>>{};
  Map<String, dynamic>? dispute;

  /// Author id → review.
  final reviews = <String, Map<String, dynamic>>{};
}

/// The codes the fake shows (the real ones are derived per booking).
const fakeHandoverCode = '482913';
const fakeReturnCode = '135790';

extension FakeRentalsApi on FakeSajhaApi {
  // ─── Helpers for tests ────────────────────────────────────────────────────

  /// Paid and handed over (as if the lender confirmed on their phone).
  void handOverAs(String bookingId) {
    final b = bookingState.bookings[bookingId]!;
    if (b.status != 'CONFIRMED') payAs(bookingId);
    b.rental.handedOverAt = DateTime.now().toUtc();
    b.rental.reports[('HANDOVER', b.lenderId)] = ['p-${++_seq}', 'p-${++_seq}'];
    _move(b, 'ACTIVE', 'HANDED_OVER', b.lenderId);
  }

  /// Returned by the borrower from their phone.
  void returnAs(String bookingId) {
    final b = bookingState.bookings[bookingId]!;
    _markReturned(b, b.borrowerId, ['p-${++_seq}', 'p-${++_seq}']);
  }

  /// The claim window passed (or an admin decided a dispute).
  void completeRental(String bookingId, {int kept = 0}) {
    final b = bookingState.bookings[bookingId]!;
    final r = b.rental..completedAt = DateTime.now().toUtc();
    r.kept = r.lateFee + kept;
    if (r.dispute != null) {
      r.dispute!
        ..['status'] = 'RESOLVED'
        ..['keptPaise'] = kept
        ..['resolutionNote'] = 'Decided by Sajha'
        ..['resolvedAt'] = r.completedAt!.toIso8601String();
    }
    final p = orderFor(bookingId);
    if (p != null && b.deposit - r.kept > 0) {
      _refund(p, b.deposit - r.kept, 'DEPOSIT_RETURN');
    }
    _move(
      b,
      'COMPLETED',
      r.dispute == null ? 'COMPLETED' : 'DISPUTE_RESOLVED',
      null,
    );
  }

  /// The lender reports a problem from their phone.
  void disputeAs(String bookingId, {int claimPaise = 60000}) {
    final b = bookingState.bookings[bookingId]!;
    final (status, json) = _rentals('POST', '/bookings/${b.id}/dispute', {
      'reason': b.status == 'ACTIVE' ? 'NOT_RETURNED' : 'DAMAGE',
      'description': 'The rain fly is torn along one seam.',
      'claimPaise': claimPaise,
      'photoKeys': <String>[],
    }, _users[b.lenderId]!)!;
    assert(status == 200, 'dispute failed: $json');
  }

  /// The other person writes their review from their phone.
  void reviewAs(String userId, String bookingId, int rating) {
    final b = bookingState.bookings[bookingId]!;
    _rentals('POST', '/bookings/${b.id}/review', {
      'rating': rating,
    }, _users[userId]!);
  }

  // ─── Endpoints ───────────────────────────────────────────────────────────

  (int, Object?)? _rentals(
    String method,
    String path,
    Map<String, dynamic> body,
    _User user,
  ) {
    final parts = path.split('/');
    if (parts.length < 4 || parts[1] != 'bookings') return null;
    final b = bookingState.bookings[parts[2]];
    if (b == null || (b.borrowerId != user.id && b.lenderId != user.id)) {
      return null; // Bookings answers the 404.
    }
    final lender = b.lenderId == user.id;
    final action = parts.skip(3).join('/');
    (int, Object?) moved() => _error(
      409,
      'BOOKING_INVALID_TRANSITION',
      'This booking has moved on. Refresh to see where it is now.',
      {'status': b.status},
    );
    List<String>? photos(Object? keys, {int min = 0}) {
      final list = [for (final k in keys as List? ?? const []) k as String];
      if (list.length < min) return null;
      for (final k in list) {
        if (_claim(user, k, 'CONDITION_PHOTO') == null) return null;
      }
      return list;
    }

    (int, Object?) photosRequired() => _error(
      400,
      'PHOTOS_REQUIRED',
      'Add at least 2 photos of the item’s condition.',
      {'min': 2},
    );
    (int, Object?) wrongCode() => _error(
      400,
      'BOOKING_CODE_INVALID',
      'That code doesn’t match. 4 tries left.',
      {'triesLeft': 4},
    );

    switch ('$method $action') {
      case 'GET code':
        if (!lender && b.status == 'CONFIRMED') {
          return (200, _code(b, 'HANDOVER', fakeHandoverCode));
        }
        if (lender && b.status == 'ACTIVE') {
          return (200, _code(b, 'RETURN', fakeReturnCode));
        }
        return moved();
      case 'POST handover':
        if (!lender || b.status != 'CONFIRMED' || !_handoverOpen(b)) {
          return moved();
        }
        if (body['code'] != fakeHandoverCode) return wrongCode();
        final keys = photos(body['photoKeys'], min: 2);
        if (keys == null) return photosRequired();
        b.rental.handedOverAt = DateTime.now().toUtc();
        b.rental.reports[('HANDOVER', user.id)] = keys;
        _move(b, 'ACTIVE', 'HANDED_OVER', user.id);
      case 'POST return':
        if (lender || b.status != 'ACTIVE') return moved();
        if (body['code'] != fakeReturnCode) return wrongCode();
        final keys = photos(body['photoKeys'], min: 2);
        if (keys == null) return photosRequired();
        _markReturned(b, user.id, keys);
      case 'POST photos':
        final stage = body['stage'] as String;
        final open = stage == 'HANDOVER'
            ? b.status == 'ACTIVE'
            : b.status == 'RETURNED';
        if (!open) return moved();
        final keys = photos(body['photoKeys'], min: 1);
        if (keys == null) return photosRequired();
        (b.rental.reports[(stage, user.id)] ??= []).addAll(keys);
        _updated(b);
      case 'POST no-show':
        if (!lender || b.status != 'CONFIRMED') return moved();
        b
          ..cancelledBy = 'BORROWER'
          ..cancelReason = 'Didn’t come for the pickup';
        b.rental.noShowAt = DateTime.now().toUtc();
        _refundCancelled(b, lender: false);
        _move(b, 'CANCELLED', 'NO_SHOW', user.id);
      case 'POST dispute':
        final active = b.status == 'ACTIVE';
        if (!lender || !(active || b.status == 'RETURNED')) return moved();
        if (active != (body['reason'] == 'NOT_RETURNED')) {
          return _error(400, 'VALIDATION_FAILED', 'Choose another reason.');
        }
        final max = b.deposit - b.rental.lateFee;
        if ((body['claimPaise'] as int) > max) {
          return _error(
            400,
            'KEEP_TOO_LARGE',
            'At most ₹${max ~/ 100} of the deposit is left to keep.',
            {'maxPaise': max},
          );
        }
        final keys = photos(body['photoKeys']);
        if (keys == null) return photosRequired();
        b.rental.dispute = {
          'reason': body['reason'],
          'description': body['description'],
          'claimPaise': body['claimPaise'],
          'evidenceKeys': keys,
          'responseNote': null,
          'responseKeys': <String>[],
          'respondedAt': null,
          'status': 'OPEN',
          'keptPaise': null,
          'resolutionNote': null,
          'resolvedAt': null,
          'createdAt': DateTime.now().toUtc().toIso8601String(),
        };
        _move(b, 'DISPUTED', 'DISPUTED', user.id);
      case 'POST dispute/response':
        final d = b.rental.dispute;
        if (lender || d == null || d['respondedAt'] != null) return moved();
        final keys = photos(body['photoKeys']);
        if (keys == null) return photosRequired();
        d
          ..['responseNote'] = body['note']
          ..['responseKeys'] = keys
          ..['respondedAt'] = DateTime.now().toUtc().toIso8601String();
        _updated(b);
      case 'POST review':
        if (b.status != 'COMPLETED' || b.rental.reviews.containsKey(user.id)) {
          return _error(409, 'REVIEW_NOT_ALLOWED', 'You can’t review this.');
        }
        b.rental.reviews[user.id] = {
          'rating': body['rating'],
          'comment': body['comment'],
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'publishedAt': null,
          'role': lender ? 'LENDER' : 'BORROWER',
          'authorName': user.name,
        };
        // Both have written one: publish both.
        if (b.rental.reviews.length == 2) {
          for (final r in b.rental.reviews.values) {
            r['publishedAt'] = DateTime.now().toUtc().toIso8601String();
          }
        }
        _updated(b);
      default:
        return null;
    }
    return (200, _bookingDetail(b, user.id));
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  Map<String, dynamic> _code(FakeBooking b, String stage, String code) => {
    'stage': stage,
    'code': code,
    'qr': 'sajha://booking/${b.id}/$stage/$code',
  };

  /// Midnight IST at the start of [day] (booking dates are Indian days,
  /// whatever the machine's time zone).
  DateTime _istMidnight(String day) => DateTime.parse('${day}T00:00:00+05:30');

  /// Due back by midnight IST after the last day.
  DateTime _dueAt(FakeBooking b) =>
      _istMidnight(b.end).add(const Duration(days: 1));

  /// From the day before the start date.
  bool _handoverOpen(FakeBooking b) => !DateTime.now().isBefore(
    _istMidnight(b.start).subtract(const Duration(days: 1)),
  );

  void _markReturned(FakeBooking b, String userId, List<String> keys) {
    final now = DateTime.now();
    final due = _dueAt(b);
    final late = now.isAfter(due)
        ? (now.difference(due).inMinutes / (24 * 60)).ceil()
        : 0;
    b.rental
      ..returnedAt = now.toUtc()
      ..lateDays = late
      ..lateFee = math.min(late * b.price, b.deposit)
      ..kept = math.min(late * b.price, b.deposit);
    b.rental.reports[('RETURN', userId)] = keys;
    _move(b, 'RETURNED', 'RETURNED', userId);
    b.expiresAt = now.toUtc().add(const Duration(hours: 24));
  }

  List<Map<String, String>> _photoJson(List<String> keys) => [
    for (final k in keys)
      {
        'url': 'http://${FakeSajhaApi.storageHost}/rentals/$k.webp',
        'thumbUrl': 'http://${FakeSajhaApi.storageHost}/rentals/$k-thumb.webp',
      },
  ];

  /// The booking detail's rental fields, from [viewerId]'s side.
  Map<String, dynamic> _rentalJson(FakeBooking b, String viewerId) {
    final r = b.rental;
    final paid = const {
      'CONFIRMED',
      'ACTIVE',
      'RETURNED',
      'COMPLETED',
      'DISPUTED',
    }.contains(b.status);
    final due = _dueAt(b);
    final out = b.status == 'ACTIVE';
    final runningLate = out && DateTime.now().isAfter(due)
        ? (DateTime.now().difference(due).inMinutes / (24 * 60)).ceil()
        : 0;
    final borrower = viewerId == b.borrowerId;
    final mine = r.reviews[viewerId];
    final theirs = r.reviews.entries
        .where((e) => e.key != viewerId && e.value['publishedAt'] != null)
        .map((e) => e.value)
        .firstOrNull;
    Map<String, dynamic> review(Map<String, dynamic> x) => {
      'rating': x['rating'],
      'comment': x['comment'],
      'createdAt': x['createdAt'],
      'publishedAt': x['publishedAt'],
    };
    final d = r.dispute;
    return {
      'rental': paid || r.noShowAt != null
          ? {
              'handedOverAt': r.handedOverAt?.toIso8601String(),
              'dueAt': due.toIso8601String(),
              'returnedAt': r.returnedAt?.toIso8601String(),
              'claimUntil': r.returnedAt
                  ?.add(const Duration(hours: 24))
                  .toIso8601String(),
              'lateDays': out ? runningLate : r.lateDays,
              'lateFeePaise': out
                  ? math.min(runningLate * b.price, b.deposit)
                  : r.lateFee,
              'keptPaise': r.kept,
              'completedAt': r.completedAt?.toIso8601String(),
              'noShowAt': r.noShowAt?.toIso8601String(),
            }
          : null,
      'conditionReports': [
        for (final stage in const ['HANDOVER', 'RETURN'])
          for (final e in r.reports.entries.where((e) => e.key.$1 == stage))
            {
              'stage': stage,
              'by': e.key.$2 == b.borrowerId ? 'BORROWER' : 'LENDER',
              'photos': _photoJson(e.value),
              'note': null,
              'at': DateTime.now().toUtc().toIso8601String(),
            },
      ],
      'dispute': d == null
          ? null
          : {
              ...d,
              'evidence': _photoJson(d['evidenceKeys'] as List<String>),
              'responsePhotos': _photoJson(d['responseKeys'] as List<String>),
            },
      'reviews': {
        'mine': mine == null ? null : review(mine),
        'theirs': theirs == null ? null : review(theirs),
        'reviewUntil': r.completedAt
            ?.add(const Duration(days: 14))
            .toIso8601String(),
      },
      'rentalCan': {
        'handover': !borrower && b.status == 'CONFIRMED' && _handoverOpen(b),
        'return': borrower && b.status == 'ACTIVE',
        'noShow':
            !borrower &&
            b.status == 'CONFIRMED' &&
            !DateTime.now().isBefore(_istMidnight(b.start)),
        'dispute':
            !borrower && (b.status == 'RETURNED' || (out && runningLate >= 3)),
        'showCode':
            (borrower && b.status == 'CONFIRMED') ||
            (!borrower && b.status == 'ACTIVE'),
        'addPhotos': b.status == 'ACTIVE' || b.status == 'RETURNED',
        'respond':
            borrower &&
            d != null &&
            d['status'] == 'OPEN' &&
            d['respondedAt'] == null,
        'review': b.status == 'COMPLETED' && mine == null,
      },
    };
  }

  Map<String, dynamic> _reviewPage(bool listing, String id) {
    final items = <Map<String, dynamic>>[];
    for (final b in bookingState.bookings.values) {
      for (final e in b.rental.reviews.entries) {
        final r = e.value;
        if (r['publishedAt'] == null) continue;
        final matches = listing
            ? b.listingId == id && r['role'] == 'BORROWER'
            : (e.key == b.borrowerId ? b.lenderId : b.borrowerId) == id;
        if (!matches) continue;
        items.add({
          'id': 'review-${b.id}-${e.key}',
          'rating': r['rating'],
          'comment': r['comment'],
          'authorRole': r['role'],
          'authorName': (r['authorName'] as String?)?.split(' ').first,
          'authorAvatarUrl': null,
          'listingTitle': listings[b.listingId]!.title,
          'publishedAt': r['publishedAt'],
        });
      }
    }
    final avg = items.isEmpty
        ? null
        : items.map((i) => i['rating'] as int).reduce((a, b) => a + b) /
              items.length;
    return {
      'ratingAvg': avg,
      'ratingCount': items.length,
      'items': items,
      'nextCursor': null,
    };
  }
}
