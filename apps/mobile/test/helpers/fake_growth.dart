part of 'fake_api.dart';

/// Saved searches, the requests board and invite credit, kept by
/// [FakeSajhaApi] (rules simplified from the API's).
class FakeGrowth {
  final savedSearches = <FakeSavedSearch>[]; // oldest first
  final requests = <String, FakeRequest>{};

  /// Invite codes by user id (made on first use).
  final codes = <String, String>{};

  /// Who invited whom: referee id → referrer id.
  final referredBy = <String, String>{};

  /// Credit ledger per user, oldest first.
  final credit = <String, List<Map<String, dynamic>>>{};

  static const rules = {
    'refereeCreditPaise': 10000,
    'referrerCreditPaise': 10000,
    'maxShareOfRentPct': 50,
    'maxReferrerRewards': 10,
    'redeemWithinDays': 30,
  };

  static const maxSavedSearches = 10;
  static const maxOpenRequests = 5;
}

class FakeSavedSearch {
  FakeSavedSearch(this.id, this.userId, this.name, this.filters);
  final String id;
  final String userId;
  String name;
  final Map<String, dynamic> filters;
  bool alertsEnabled = true;
  final createdAt = DateTime.now().toUtc();

  Map<String, dynamic> get json => {
    'id': id,
    'name': name,
    'filters': filters,
    'alertsEnabled': alertsEnabled,
    'createdAt': createdAt.toIso8601String(),
  };
}

class FakeRequest {
  FakeRequest(this.id, this.borrowerId, this.fields);
  final String id;
  final String borrowerId;
  final Map<String, dynamic> fields;
  String status = 'OPEN';
  final responses = <FakeResponse>[];
  final createdAt = DateTime.now().toUtc();

  double get lat => (fields['lat'] as num).toDouble();
  double get lng => (fields['lng'] as num).toDouble();
}

class FakeResponse {
  FakeResponse(
    this.id,
    this.lenderId,
    this.listingId,
    this.conversationId,
    this.message,
  );
  final String id;
  final String lenderId;
  final String listingId;
  final String conversationId;
  final String message;
  final createdAt = DateTime.now().toUtc();
}

extension FakeGrowthApi on FakeSajhaApi {
  // ─── Helpers for tests ────────────────────────────────────────────────────

  String referralCodeFor(String userId) => growth.codes.putIfAbsent(userId, () {
    final first = (_users[userId]?.name ?? 'Sajha').split(' ').first;
    return '${first.toUpperCase()}${++_seq}';
  });

  /// Adds credit to [userId]'s balance (e.g. a welcome credit).
  void grantCredit(
    String userId,
    int paise, {
    String kind = 'GRANT_REFEREE',
    String? reason,
  }) => _ledger(userId, kind, paise, reason: reason);

  int creditBalance(String userId) => (growth.credit[userId] ?? const []).fold(
    0,
    (sum, e) => sum + (e['amountPaise'] as int),
  );

  /// Credit a booking with [rentPaise] of rent would use.
  int creditFor(String userId, int rentPaise) {
    final pct = FakeGrowth.rules['maxShareOfRentPct']!;
    return math.min(creditBalance(userId), rentPaise * pct ~/ 100);
  }

  /// An open request by [borrowerId], as if posted from their phone.
  FakeRequest seedRequest(
    String borrowerId, {
    String title = 'Need a 4-person tent',
    String details = 'For a weekend trek to Rajmachi.',
    String? categoryId = 'cat-trek',
    double lat = 18.5090,
    double lng = 73.8090,
    String areaLabel = 'Kothrud, Pune',
    String? startDate,
    String? endDate,
    int? budgetPerDayPaise,
  }) {
    final r = FakeRequest('request-${++_seq}', borrowerId, {
      'title': title,
      'details': details,
      'categoryId': categoryId,
      'lat': lat,
      'lng': lng,
      'areaLabel': areaLabel,
      'startDate': startDate,
      'endDate': endDate,
      'budgetPerDayPaise': budgetPerDayPaise,
    });
    growth.requests[r.id] = r;
    return r;
  }

  /// A bell notification (and live event) for [userId].
  void notifyUser(
    String userId,
    String type,
    String title,
    String body, {
    String? bookingId,
    String? listingId,
    String? requestId,
  }) => _notify(
    userId,
    type,
    title,
    body,
    bookingId,
    push: true,
    listingId: listingId,
    requestId: requestId,
  );

  // ─── Endpoints ───────────────────────────────────────────────────────────

  (int, Object?)? _growth(
    String method,
    String path,
    Map<String, dynamic> body,
    Map<String, String> query,
    _User user,
  ) {
    switch ('$method $path') {
      case 'GET /me/saved-searches':
        return (
          200,
          [
            for (final s in growth.savedSearches.reversed)
              if (s.userId == user.id) s.json,
          ],
        );
      case 'POST /me/saved-searches':
        final f = body['filters'];
        final name = (body['name'] as String?)?.trim();
        if (f is! Map || f['lat'] is! num || f['lng'] is! num) {
          return _error(400, 'VALIDATION_FAILED', 'Filters need a place');
        }
        final radius = (f['radiusKm'] as num?)?.toInt() ?? 5;
        if (radius < 1 || radius > 25 || (name != null && name.length > 60)) {
          return _error(400, 'VALIDATION_FAILED', 'Check the filters');
        }
        if (growth.savedSearches.where((s) => s.userId == user.id).length >=
            FakeGrowth.maxSavedSearches) {
          return _error(
            409,
            'SAVED_SEARCH_LIMIT',
            'You can save up to 10 searches. Delete one to save another.',
          );
        }
        final filters = {...Map<String, dynamic>.from(f), 'radiusKm': radius};
        final s = FakeSavedSearch(
          'saved-${++_seq}',
          user.id,
          name == null || name.isEmpty ? _searchName(filters) : name,
          filters,
        )..alertsEnabled = body['alertsEnabled'] as bool? ?? true;
        growth.savedSearches.add(s);
        return (201, s.json);
      case 'GET /requests':
        final lat = double.tryParse(query['lat'] ?? '');
        final lng = double.tryParse(query['lng'] ?? '');
        if (lat == null || lng == null) {
          return _error(400, 'VALIDATION_FAILED', 'lat and lng are required');
        }
        final radius = double.parse(query['radiusKm'] ?? '10') * 1000;
        double meters(FakeRequest r) =>
            FakeSajhaApi._haversine(lat, lng, r.lat, r.lng);
        final found =
            growth.requests.values
                .where(
                  (r) =>
                      r.status == 'OPEN' &&
                      r.borrowerId != user.id &&
                      meters(r) <= radius &&
                      (query['categoryId'] == null ||
                          r.fields['categoryId'] == query['categoryId']),
                )
                .toList()
              ..sort((a, b) => meters(a).compareTo(meters(b)));
        final offset = int.tryParse(query['cursor'] ?? '') ?? 0;
        final limit = int.tryParse(query['limit'] ?? '') ?? 20;
        final page = found.skip(offset).take(limit).toList();
        final next = offset + page.length;
        return (
          200,
          {
            'items': [
              for (final r in page) _requestJson(r, user, meters: meters(r)),
            ],
            'nextCursor': next < found.length ? '$next' : null,
          },
        );
      case 'POST /requests':
        if (!user.emailVerified) {
          return _error(403, 'VERIFICATION_REQUIRED', 'Verify', {
            'missing': ['email'],
          });
        }
        String text(String key) => (body[key] as String? ?? '').trim();
        final title = text('title');
        final details = text('details');
        final area = text('areaLabel');
        if (title.length < 3 ||
            title.length > 80 ||
            details.isEmpty ||
            details.length > 500 ||
            area.length < 2 ||
            area.length > 80 ||
            body['lat'] is! num ||
            body['lng'] is! num ||
            (body['startDate'] == null) != (body['endDate'] == null)) {
          return _error(400, 'VALIDATION_FAILED', 'Please check the request');
        }
        if (growth.requests.values
                .where((r) => r.borrowerId == user.id && r.status == 'OPEN')
                .length >=
            FakeGrowth.maxOpenRequests) {
          return _error(
            409,
            'REQUEST_LIMIT',
            'You can have 5 open requests at a time. Close one to ask for '
                'something else.',
          );
        }
        final r = seedRequest(
          user.id,
          title: title,
          details: details,
          categoryId: body['categoryId'] as String?,
          lat: (body['lat'] as num).toDouble(),
          lng: (body['lng'] as num).toDouble(),
          areaLabel: area,
          startDate: body['startDate'] as String?,
          endDate: body['endDate'] as String?,
          budgetPerDayPaise: body['budgetPerDayPaise'] as int?,
        );
        return (201, _requestJson(r, user, detail: true));
      case 'GET /me/requests':
        return (
          200,
          [
            for (final r in growth.requests.values.toList().reversed)
              if (r.borrowerId == user.id) _requestJson(r, user, detail: true),
          ],
        );
      case 'GET /me/referral':
        return (200, _referralJson(user));
      case 'POST /me/referral/redeem':
        final code = (body['code'] as String? ?? '')
            .replaceAll(RegExp(r'\s'), '')
            .toUpperCase();
        final owner = growth.codes.entries
            .where((e) => e.value == code)
            .firstOrNull
            ?.key;
        if (owner == null) {
          return _error(
            400,
            'REFERRAL_CODE_INVALID',
            'That invite code isn’t right. Check it and try again.',
          );
        }
        if (owner == user.id || !_canRedeem(user.id)) {
          return _error(
            409,
            'REFERRAL_NOT_ALLOWED',
            'Invite codes are for new members who haven’t rented yet.',
          );
        }
        growth.referredBy[user.id] = owner;
        _ledger(
          user.id,
          'GRANT_REFEREE',
          FakeGrowth.rules['refereeCreditPaise']!,
        );
        notifyUser(
          owner,
          'referral.joined',
          'Your friend joined',
          '${user.name ?? 'A friend'} used your invite code.',
        );
        return (200, _referralJson(user));
    }

    final parts = path.split('/');
    if (parts.length >= 4 && parts[1] == 'me' && parts[2] == 'saved-searches') {
      final s = growth.savedSearches
          .where((s) => s.id == parts[3] && s.userId == user.id)
          .firstOrNull;
      if (s == null) return _error(404, 'NOT_FOUND', 'Saved search not found');
      final action = parts.skip(4).join('/');
      switch ('$method $action') {
        case 'PATCH ':
          final name = (body['name'] as String?)?.trim();
          if (name != null) {
            if (name.isEmpty || name.length > 60) {
              return _error(400, 'VALIDATION_FAILED', 'Name 1–60 characters');
            }
            s.name = name;
          }
          if (body['alertsEnabled'] is bool) {
            s.alertsEnabled = body['alertsEnabled'] as bool;
          }
          return (200, s.json);
        case 'DELETE ':
          growth.savedSearches.remove(s);
          return (204, null);
        case 'GET results':
          final f = s.filters;
          return _discovery('/search', {
            'lat': '${f['lat']}',
            'lng': '${f['lng']}',
            'radiusKm': '${f['radiusKm']}',
            if (f['q'] != null) 'q': f['q'] as String,
            if (f['categoryId'] != null)
              'categoryId': f['categoryId'] as String,
            if (f['minPricePaise'] != null)
              'minPricePaise': '${f['minPricePaise']}',
            if (f['maxPricePaise'] != null)
              'maxPricePaise': '${f['maxPricePaise']}',
            if (f['condition'] is List)
              'condition': (f['condition'] as List).join(','),
            if (f['verifiedLendersOnly'] == true) 'verifiedLendersOnly': 'true',
            'sort': 'newest',
            ...query,
          }, user);
      }
      return null;
    }

    if (parts.length >= 3 && parts[1] == 'requests') {
      final r = growth.requests[parts[2]];
      final mine = r?.borrowerId == user.id;
      if (r == null || (r.status != 'OPEN' && !mine)) {
        return _error(404, 'NOT_FOUND', 'Request not found');
      }
      final action = parts.skip(3).join('/');
      switch ('$method $action') {
        case 'GET ':
          return (200, _requestJson(r, user, detail: true));
        case 'POST close':
          if (!mine) return _error(404, 'NOT_FOUND', 'Request not found');
          if (r.status != 'OPEN') {
            return _error(409, 'REQUEST_NOT_OPEN', 'Already closed');
          }
          r.status = 'CLOSED';
          return (200, _requestJson(r, user, detail: true));
        case 'POST responses':
          if (mine) {
            return _error(400, 'REQUEST_OWN', 'That’s your own request.');
          }
          if (r.status != 'OPEN') {
            return _error(
              409,
              'REQUEST_NOT_OPEN',
              'This request is closed now.',
            );
          }
          final l = listings[body['listingId']];
          if (l == null || l.lenderId != user.id || l.status != 'LIVE') {
            return _error(404, 'NOT_FOUND', 'Listing not found');
          }
          final message = (body['message'] as String? ?? '').trim();
          if (message.isEmpty || message.length > 500) {
            return _error(400, 'VALIDATION_FAILED', 'Add a short note');
          }
          if (r.responses.any(
            (x) => x.lenderId == user.id && x.listingId == l.id,
          )) {
            return _error(
              409,
              'REQUEST_ALREADY_ANSWERED',
              'You’ve already offered this item.',
            );
          }
          final c =
              chat.conversations.values
                  .where(
                    (c) => c.listingId == l.id && c.borrowerId == r.borrowerId,
                  )
                  .firstOrNull ??
              seedConversation(r.borrowerId, l.id);
          final (masked, hidden) = fakeMask(message);
          _post(
            c,
            FakeMessage(
              id: _msgId(),
              senderId: user.id,
              type: 'TEXT',
              body: message,
              maskedBody: masked,
              masked: hidden,
              createdAt: DateTime.now().toUtc(),
            ),
          );
          r.responses.add(
            FakeResponse('response-${++_seq}', user.id, l.id, c.id, message),
          );
          notifyUser(
            r.borrowerId,
            'request.response',
            'Someone has one',
            '${user.name?.split(' ').first ?? 'A lender'} offered ${l.title}.',
            requestId: r.id,
          );
          return (201, _requestJson(r, user, detail: true));
      }
    }
    return null;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  String _searchName(Map<String, dynamic> f) {
    final q = f['q'] as String?;
    final category = FakeSajhaApi.categories
        .where((c) => c['id'] == f['categoryId'])
        .firstOrNull?['name'];
    final what = q != null && q.isNotEmpty ? '“$q”' : category ?? 'Anything';
    return '$what within ${f['radiusKm']} km';
  }

  Map<String, dynamic> _person(_User u) => {
    'id': u.id,
    'name': u.name,
    'avatarUrl': u.avatarUrl,
    'idVerified': u.json['idVerified'],
  };

  Map<String, dynamic> _requestJson(
    FakeRequest r,
    _User viewer, {
    double? meters,
    bool detail = false,
  }) {
    final f = r.fields;
    final mine = r.borrowerId == viewer.id;
    return {
      'id': r.id,
      'title': f['title'],
      'details': f['details'],
      'category': FakeSajhaApi.categories
          .where((c) => c['id'] == f['categoryId'])
          .firstOrNull,
      'startDate': f['startDate'],
      'endDate': f['endDate'],
      'budgetPerDayPaise': f['budgetPerDayPaise'],
      'areaLabel': f['areaLabel'],
      'distanceKm': meters == null
          ? null
          : (meters < 1000 ? 0.5 : (meters / 500).round() / 2),
      'borrower': _person(_users[r.borrowerId]!),
      'status': r.status,
      'responseCount': r.responses.length,
      'answeredByMe': r.responses.any((x) => x.lenderId == viewer.id),
      'mine': mine,
      'expiresAt': r.createdAt.add(const Duration(days: 14)).toIso8601String(),
      'createdAt': r.createdAt.toIso8601String(),
      if (detail)
        'responses': [
          for (final x in r.responses.reversed)
            if (mine || x.lenderId == viewer.id)
              {
                'id': x.id,
                'lender': _person(_users[x.lenderId]!),
                'listing': listings[x.listingId]!.status == 'DELETED'
                    ? null
                    : _card(listings[x.listingId]!, viewer),
                'conversationId': x.conversationId,
                'message': x.message,
                'createdAt': x.createdAt.toIso8601String(),
              },
        ],
    };
  }

  bool _canRedeem(String userId) =>
      !growth.referredBy.containsKey(userId) &&
      !bookingState.bookings.values.any((b) => b.borrowerId == userId);

  void _ledger(
    String userId,
    String kind,
    int amount, {
    String? bookingId,
    String? reason,
  }) => (growth.credit[userId] ??= []).add({
    'id': 'credit-${++_seq}',
    'kind': kind,
    'amountPaise': amount,
    'bookingId': bookingId,
    'reason': reason,
    'createdAt': DateTime.now().toUtc().toIso8601String(),
  });

  /// A new booking uses what credit it can (up to half the rent).
  void _holdCredit(FakeBooking b) {
    final credit = creditFor(b.borrowerId, b.rent);
    if (credit == 0) return;
    b.credit = credit;
    _ledger(b.borrowerId, 'HOLD', -credit, bookingId: b.id);
  }

  void _releaseCredit(FakeBooking b) {
    if (b.credit == 0) return;
    _ledger(b.borrowerId, 'RELEASE', b.credit, bookingId: b.id);
  }

  Map<String, dynamic> _referralJson(_User user) {
    final code = referralCodeFor(user.id);
    final entries = growth.credit[user.id] ?? const [];
    final balance = creditBalance(user.id);
    final firstGrant = entries
        .where((e) => (e['kind'] as String).startsWith('GRANT'))
        .firstOrNull;
    final referrer = growth.referredBy[user.id];
    return {
      'code': code,
      'link': 'https://sajha.app/r/$code',
      'invited': growth.referredBy.values.where((v) => v == user.id).length,
      'rewarded': entries.where((e) => e['kind'] == 'GRANT_REFERRER').length,
      'creditBalancePaise': balance,
      'canRedeem': _canRedeem(user.id),
      'redeemBefore': balance > 0 && firstGrant != null
          ? DateTime.parse(firstGrant['createdAt'] as String)
                .add(const Duration(days: 30))
                .toIso8601String()
          : null,
      'referredBy': referrer == null ? null : _person(_users[referrer]!),
      'entries': entries.reversed.toList(),
      'rules': FakeGrowth.rules,
    };
  }
}
