import 'dart:convert';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:dio/dio.dart';

part 'fake_bookings.dart';
part 'fake_chat.dart';
part 'fake_payments.dart';
part 'fake_rentals.dart';

/// In-memory stand-in for the Sajha API, plugged into Dio as its HTTP adapter.
/// Mirrors the real endpoints and error shapes closely enough to drive
/// full sign-in flows in widget tests.
class FakeSajhaApi implements HttpClientAdapter {
  /// Every SMS / email code is this value.
  static const code = '123456';

  final requests = <String>[];
  final _users = <String, _User>{}; // by id
  final _sessions = <String, _Session>{};
  final _challenges = <String, _Challenge>{};
  final _expiredAccess = <String>{};
  final _uploads = <String, _Upload>{}; // by key
  final documents = <String, FakeDocument>{}; // by id
  final listings = <String, FakeListing>{}; // by id

  /// Wishlists: user id → listing ids in the order they were saved.
  final favorites = <String, List<String>>{};

  /// Listing views counted for "Popular this week".
  final views = <String, int>{};

  /// Lenders whose listings go live without review (an admin approved one).
  final trustedLenders = <String>{};

  static const categories = [
    {
      'id': 'cat-trek',
      'name': 'Trekking & outdoor gear',
      'slug': 'trekking-outdoor',
      'icon': 'hiking',
    },
    {
      'id': 'cat-camera',
      'name': 'Cameras & electronics',
      'slug': 'cameras-electronics',
      'icon': 'photo_camera',
    },
  ];

  static const rules = {
    'commissionBps': 1000,
    'pricePerDayPaise': {'min': 1000, 'max': 1000000},
    'depositPaise': {'min': 0, 'max': 5000000},
    'weeklyDiscountPct': {'min': 0, 'max': 50},
    'rentalDays': {'min': 1, 'max': 90},
    'advanceNoticeDays': {'min': 0, 'max': 7},
    'photos': {'min': 1, 'max': 8},
    'maxBlockedRanges': 50,
  };

  /// Admin approval, as the admin panel would do it.
  void approveListing(String id) {
    final l = listings[id]!..status = 'LIVE';
    trustedLenders.add(l.lenderId);
  }

  void rejectListing(String id, String reason) => listings[id]!
    ..status = 'REJECTED'
    ..rejectionReason = reason;

  /// A listing with one photo in [status]. Owned by [lenderId], or by the
  /// first seeded user.
  FakeListing seedListing({
    String status = 'LIVE',
    String title = 'Quechua trekking tent',
    String? rejectionReason,
    String? lenderId,
    String categoryId = 'cat-trek',
    String description = 'Two-person tent, used on three treks. Pegs included.',
    String condition = 'GOOD',
    int pricePerDayPaise = 15000,
    int weeklyDiscountPct = 10,
    int minDays = 1,
    int maxDays = 30,
    int advanceNoticeDays = 1,
    double lat = 18.5074,
    double lng = 73.8077,
    String areaLabel = 'Kothrud, Pune',
    List<Map<String, String>> blocks = const [],
  }) {
    final lender = lenderId ?? _users.values.first.id;
    final l = FakeListing('listing-${++_seq}', lender)
      ..fields.addAll({
        'categoryId': categoryId,
        'title': title,
        'description': description,
        'condition': condition,
        'pricePerDayPaise': pricePerDayPaise,
        'weeklyDiscountPct': weeklyDiscountPct,
        'depositPaise': 100000,
        'minDays': minDays,
        'maxDays': maxDays,
        'advanceNoticeDays': advanceNoticeDays,
        'lat': lat,
        'lng': lng,
        'areaLabel': areaLabel,
      })
      ..status = status
      ..rejectionReason = rejectionReason
      ..blocks = List.of(blocks)
      ..photos.add(_newPhoto());
    listings[l.id] = l;
    return l;
  }

  /// A lender with no session on this device; returns their id.
  String seedLender({
    String name = 'Asha Patil',
    String phone = '+919812345678',
    bool idVerified = false,
  }) {
    final u = _createUser(phone)
      ..name = name
      ..email = '${name.split(' ').first.toLowerCase()}@example.com'
      ..emailVerified = true
      ..idVerifiedFlag = idVerified;
    return u.id;
  }

  Map<String, dynamic> _newPhoto() {
    final id = 'photo-${++_seq}';
    return {
      'id': id,
      'url': 'http://cdn.test/listings/$id.webp',
      'thumbUrl': 'http://cdn.test/listings/$id-thumb.webp',
      'width': 1600,
      'height': 1200,
    };
  }

  int _seq = 0;
  bool offline = false;

  /// Requests ('POST /payments/verify') that fail as if the network dropped.
  final offlineFor = <String>{};

  /// Host that plays object storage for presigned PUTs and document views.
  static const storageHost = 'storage.test';

  /// Headers of every PUT to [storageHost], to check no token leaks there.
  final storagePuts = <Map<String, dynamic>>[];

  int get refreshCalls =>
      requests.where((r) => r == 'POST /auth/refresh').length;

  /// Creates a user and a signed-in session; returns its refresh token.
  String seedSession({
    String phone = '+919876543210',
    String? name = 'Rahul Sharma',
    bool emailVerified = true,
  }) {
    final user = _createUser(phone)
      ..name = name
      ..email = emailVerified ? 'rahul@example.com' : null
      ..emailVerified = emailVerified;
    return _newSession(user.id).refresh;
  }

  /// A signed-in session for an existing user (e.g. a seeded lender).
  String seedSessionFor(String phone) =>
      _newSession(_users.values.firstWhere((u) => u.phone == phone).id).refresh;

  /// Makes every access token issued so far fail with TOKEN_EXPIRED.
  void expireAccessTokens() =>
      _expiredAccess.addAll(_sessions.values.expand((s) => s.access));

  /// Signs every device out on the server (e.g. "log out all" from another phone).
  void revokeAllSessions() {
    for (final s in _sessions.values) {
      s.revoked = true;
    }
  }

  void suspendAll() {
    for (final u in _users.values) {
      u.suspended = true;
    }
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final route =
        '${options.method} ${options.uri.path.replaceFirst('/v1', '')}';
    if (offline || offlineFor.contains(route)) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'offline',
      );
    }
    if (options.uri.host == storageHost) {
      return _storage(options, requestStream);
    }
    final path = options.uri.path.replaceFirst('/v1', '');
    final key = '${options.method} $path';
    requests.add(key);
    final body = options.data is Map
        ? Map<String, dynamic>.from(options.data as Map)
        : <String, dynamic>{};
    final auth = options.headers['Authorization'] as String?;
    lastQueries[path] = options.uri.queryParameters;
    final (status, json) = _handle(
      options.method,
      path,
      body,
      auth,
      options.uri.queryParameters,
    );
    return ResponseBody.fromString(
      json == null ? '' : jsonEncode(json),
      status,
      headers: json == null
          ? {}
          : {
              Headers.contentTypeHeader: [Headers.jsonContentType],
            },
    );
  }

  @override
  void close({bool force = false}) {}

  /// Presigned PUT: the signed Content-Type and Content-Length must match.
  Future<ResponseBody> _storage(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
  ) async {
    if (options.method != 'PUT') return ResponseBody.fromString('', 200);
    storagePuts.add(Map.of(options.headers));
    final bytes = <int>[];
    if (requestStream != null) {
      await for (final chunk in requestStream) {
        bytes.addAll(chunk);
      }
    }
    final upload = _uploads[options.uri.path.substring(1)];
    if (upload == null ||
        options.headers['Content-Type'] != upload.contentType ||
        bytes.length != upload.size) {
      return ResponseBody.fromString(
        '<Error>SignatureDoesNotMatch</Error>',
        403,
      );
    }
    upload.uploaded = true;
    return ResponseBody.fromString('', 200);
  }

  /// Admin review, as the admin panel would do it.
  void review(String documentId, {bool approve = true, String? reason}) {
    documents[documentId]!
      ..status = approve ? 'APPROVED' : 'REJECTED'
      ..rejectionReason = approve ? null : reason;
  }

  /// Chats, offers, blocks, reports and push tokens (see fake_chat.dart).
  final chat = FakeChat();

  /// Bookings and notifications (see fake_bookings.dart).
  final bookingState = FakeBookings();
  final payments = FakePayments();

  /// The user the app is signed in as (the last authenticated caller).
  String? appUserId;

  /// Live events for [FakeRealtime]: (recipient, event, payload).
  void Function(String userId, String event, Map<String, dynamic> data)?
  onRealtime;

  /// Query parameters of the last request to each path.
  final lastQueries = <String, Map<String, String>>{};

  (int, Object?) _handle(
    String method,
    String path,
    Map<String, dynamic> body,
    String? auth,
    Map<String, String> query,
  ) {
    // Published reviews are public.
    final reviews = RegExp(r'^/(listings|users)/([^/]+)/reviews$')
        .firstMatch(path);
    if (method == 'GET' && reviews != null) {
      return (
        200,
        _reviewPage(reviews.group(1) == 'listings', reviews.group(2)!),
      );
    }
    if (method == 'GET' &&
        (path == '/home' ||
            path == '/search' ||
            path == '/listings' ||
            path.startsWith('/listings/'))) {
      // Public, with optional sign-in: a bad token is still a 401.
      _User? viewer;
      if (auth != null) {
        final token = auth.replaceFirst('Bearer ', '');
        final s = _sessions.values
            .where((s) => s.access.contains(token))
            .firstOrNull;
        if (s == null || s.revoked) {
          return _error(401, 'TOKEN_INVALID', 'Invalid token');
        }
        if (_expiredAccess.contains(token)) {
          return _error(401, 'TOKEN_EXPIRED', 'Token expired');
        }
        viewer = _users[s.userId];
      }
      return _discovery(path, query, viewer);
    }
    switch ('$method $path') {
      case 'GET /categories':
        return (200, [for (final c in categories) c]);
      case 'GET /config':
        return (200, rules);
      case 'POST /auth/otp/request':
        final phone = body['phone'] as String;
        if (!RegExp(r'^\+91[6-9]\d{9}$').hasMatch(phone)) {
          return _error(400, 'PHONE_INVALID', 'Enter a valid number');
        }
        return (200, _challenge(phone, null));
      case 'POST /auth/otp/verify':
        final challenge = _challenges[body['challengeId']];
        final err = _checkCode(challenge, body['code'] as String);
        if (err != null) return err;
        var user = _users.values
            .where((u) => u.phone == challenge!.target)
            .firstOrNull;
        if (user != null && user.suspended) {
          return _error(403, 'ACCOUNT_SUSPENDED', 'Suspended');
        }
        final isNew = user == null;
        user ??= _createUser(challenge!.target);
        final session = _newSession(
          user.id,
          deviceName: body['deviceName'] as String?,
          platform: body['platform'] as String?,
        );
        return (
          200,
          {
            'accessToken': session.access.last,
            'refreshToken': session.refresh,
            'expiresInSec': 900,
            'isNewUser': isNew,
            'user': user.json,
          },
        );
      case 'POST /auth/refresh':
        final session = _sessions.values
            .where((s) => s.refresh == body['refreshToken'])
            .firstOrNull;
        if (session == null || session.revoked) {
          return _error(401, 'TOKEN_INVALID', 'Invalid token');
        }
        if (_users[session.userId]!.suspended) {
          return _error(403, 'ACCOUNT_SUSPENDED', 'Suspended');
        }
        session.refresh = 'refresh-${++_seq}';
        session.access.add('access-${++_seq}');
        return (
          200,
          {
            'accessToken': session.access.last,
            'refreshToken': session.refresh,
            'expiresInSec': 900,
          },
        );
    }

    // Everything below needs a valid access token.
    final token = auth?.replaceFirst('Bearer ', '');
    final session = _sessions.values
        .where((s) => s.access.contains(token))
        .firstOrNull;
    if (session == null || session.revoked) {
      return _error(401, 'TOKEN_INVALID', 'Invalid token');
    }
    if (_expiredAccess.contains(token)) {
      return _error(401, 'TOKEN_EXPIRED', 'Token expired');
    }
    final user = _users[session.userId]!;
    if (user.suspended) return _error(403, 'ACCOUNT_SUSPENDED', 'Suspended');
    appUserId = user.id;

    switch ('$method $path') {
      case 'GET /me':
        return (200, {'user': user.json});
      case 'PATCH /me':
        String? clean(Object? v) {
          final s = (v as String).trim();
          return s.isEmpty ? null : s;
        }
        if (body.containsKey('name')) user.name = clean(body['name']);
        if (body.containsKey('city')) user.city = clean(body['city']);
        if (body.containsKey('bio')) user.bio = clean(body['bio']);
        return (200, {'user': user.json});
      case 'POST /uploads':
        final key =
            'tmp/${(body['purpose'] as String).toLowerCase()}/'
            '${user.id}/${++_seq}';
        _uploads[key] = _Upload(
          user.id,
          body['purpose'] as String,
          body['contentType'] as String,
          body['sizeBytes'] as int,
        );
        return (
          201,
          {
            'key': key,
            'url': 'http://$storageHost/$key?X-Amz-Signature=fake',
            'headers': {'Content-Type': body['contentType']},
            'expiresInSec': 300,
          },
        );
      case 'PUT /me/avatar':
        if (_claim(user, body['key'], 'AVATAR') == null) {
          return _error(400, 'UPLOAD_NOT_FOUND', 'Upload not found');
        }
        user.avatarUrl = 'http://cdn.test/avatars/${user.id}/${++_seq}.webp';
        return (200, {'user': user.json});
      case 'DELETE /me/avatar':
        user.avatarUrl = null;
        return (200, {'user': user.json});
      case 'GET /me/listings':
        return (
          200,
          [
            for (final l in listings.values.toList().reversed)
              if (l.lenderId == user.id && l.status != 'DELETED') l.json,
          ],
        );
      case 'POST /me/listings':
        if (!user.emailVerified) {
          return _error(403, 'VERIFICATION_REQUIRED', 'Verify', {
            'missing': ['email'],
          });
        }
        final l = FakeListing('listing-${++_seq}', user.id)
          ..fields.addAll(body);
        listings[l.id] = l;
        return (201, l.json);
      case 'GET /me/documents':
        return (
          200,
          [
            for (final d in documents.values.where((d) => d.userId == user.id))
              d.json,
          ],
        );
      case 'POST /me/documents':
        final type = body['type'] as String;
        if (type == 'OTHER' && body['label'] == null) {
          return _error(400, 'VALIDATION_FAILED', 'Label required', {
            'label': ['label is required'],
          });
        }
        if (documents.values.any(
          (d) =>
              d.userId == user.id && d.type == type && d.status != 'REJECTED',
        )) {
          return _error(409, 'DOCUMENT_ALREADY_EXISTS', 'Already exists');
        }
        final back = body['backKey'];
        if (_claim(user, body['frontKey'], 'DOCUMENT') == null ||
            (back != null && _claim(user, back, 'DOCUMENT') == null)) {
          return _error(400, 'UPLOAD_NOT_FOUND', 'Upload not found');
        }
        final doc = FakeDocument(
          'doc-${++_seq}',
          user.id,
          type,
          label: body['label'] as String?,
          hasBack: back != null,
          expiresOn: body['expiresOn'] as String?,
        );
        documents[doc.id] = doc;
        return (201, doc.json);
      case 'DELETE /me':
        _users.remove(user.id);
        _sessions.values
            .where((s) => s.userId == user.id)
            .forEach((s) => s.revoked = true);
        return (202, null);
      case 'POST /auth/logout':
        session.revoked = true;
        return (204, null);
      case 'POST /auth/logout-all':
        _sessions.values
            .where((s) => s.userId == user.id)
            .forEach((s) => s.revoked = true);
        return (204, null);
      case 'POST /auth/email/otp/request':
        final email = body['email'] as String;
        if (_users.values.any((u) => u.email == email && u.id != user.id)) {
          return _error(409, 'EMAIL_IN_USE', 'Email in use');
        }
        return (200, _challenge(email, user.id));
      case 'POST /auth/email/otp/verify':
        final challenge = _challenges[body['challengeId']];
        final err = _checkCode(challenge, body['code'] as String);
        if (err != null) return err;
        user
          ..email = challenge!.target
          ..emailVerified = true;
        return (200, {'user': user.json});
      case 'GET /me/favorites':
        final ids = favorites[user.id] ?? const [];
        return (
          200,
          [
            for (final id in ids.reversed)
              if (listings[id]!.status != 'DELETED') _card(listings[id]!, user),
          ],
        );
      case 'GET /me/sessions':
        return (
          200,
          [
            for (final s in _sessions.values.where(
              (s) => s.userId == user.id && !s.revoked,
            ))
              {
                'id': s.id,
                'deviceName': s.deviceName,
                'platform': s.platform,
                'createdAt': '2026-09-01T10:00:00.000Z',
                'lastUsedAt': '2026-09-20T10:00:00.000Z',
                'current': s.id == session.id,
              },
          ],
        );
    }
    if (path.startsWith('/me/listings/')) {
      final parts = path.split('/'); // ['', 'me', 'listings', id, ...]
      final l = listings[parts[3]];
      if (l == null || l.lenderId != user.id || l.status == 'DELETED') {
        return _error(404, 'NOT_FOUND', 'Listing not found');
      }
      final action = parts.skip(4).join('/');
      (int, Object?) conflict() =>
          _error(409, 'LISTING_STATUS_CONFLICT', 'Wrong status');
      switch ('$method $action') {
        case 'GET ':
          return (200, l.json);
        case 'PATCH ':
          l.fields.addAll(body);
          if (l.status == 'REJECTED') {
            l
              ..status = 'DRAFT'
              ..rejectionReason = null;
          }
          return (200, l.json);
        case 'POST photos':
          if (_claim(user, body['key'], 'LISTING_PHOTO') == null) {
            return _error(400, 'UPLOAD_NOT_FOUND', 'Upload not found');
          }
          if (l.photos.length >= 8) {
            return _error(409, 'LISTING_PHOTO_LIMIT', 'Too many');
          }
          l.photos.add(_newPhoto());
          return (201, l.json);
        case 'PUT photos/order':
          final ids = (body['ids'] as List).cast<String>();
          l.photos.sort(
            (a, b) => ids.indexOf(a['id']).compareTo(ids.indexOf(b['id'])),
          );
          return (200, l.json);
        case 'PUT blocks':
          l.blocks = List.of(body['ranges'] as List);
          return (200, l.json);
        case 'PUT required-docs':
          l.requiredDocs = List.of(body['items'] as List);
          return (200, l.json);
        case 'POST publish':
          if (l.status != 'DRAFT') return conflict();
          if (l.photos.isEmpty || l.fields['lat'] == null) {
            return _error(400, 'LISTING_INCOMPLETE', 'Incomplete');
          }
          final trusted = trustedLenders.contains(user.id);
          l.status = trusted ? 'LIVE' : 'PENDING';
          return (200, {'listing': l.json, 'inReview': !trusted});
        case 'POST pause':
          if (l.status != 'LIVE') return conflict();
          l.status = 'PAUSED';
          return (200, l.json);
        case 'POST unpause':
          if (l.status != 'PAUSED') return conflict();
          l.status = 'LIVE';
          return (200, l.json);
        case 'DELETE ':
          l.status = 'DELETED';
          return (204, null);
      }
      if (method == 'DELETE' && parts.length == 6 && parts[4] == 'photos') {
        l.photos.removeWhere((p) => p['id'] == parts[5]);
        return (200, l.json);
      }
    }
    if (path.startsWith('/me/favorites/')) {
      final id = path.split('/').last;
      final saved = favorites.putIfAbsent(user.id, () => []);
      if (method == 'DELETE') {
        saved.remove(id);
        return (204, null);
      }
      final l = listings[id];
      if (l == null || l.status != 'LIVE') {
        return _error(404, 'NOT_FOUND', 'Listing not found');
      }
      if (l.lenderId == user.id) {
        return _error(400, 'FAVORITE_OWN_LISTING', 'Own listing');
      }
      if (!saved.contains(id)) saved.add(id);
      return (204, null);
    }
    if (path.startsWith('/me/documents/')) {
      final parts = path.split('/'); // ['', 'me', 'documents', id, 'view'?]
      final doc = documents[parts[3]];
      if (doc == null || doc.userId != user.id) {
        return _error(404, 'NOT_FOUND', 'Document not found');
      }
      if (method == 'GET' && parts.length == 5) {
        return (
          200,
          {'url': 'http://$storageHost/view/${doc.id}', 'expiresInSec': 300},
        );
      }
      if (method == 'DELETE') {
        documents.remove(doc.id);
        return (204, null);
      }
    }
    if (method == 'DELETE' && path.startsWith('/me/sessions/')) {
      final target = _sessions[path.split('/').last];
      if (target == null || target.userId != user.id) {
        return _error(404, 'NOT_FOUND', 'Not found');
      }
      target.revoked = true;
      return (204, null);
    }
    final rentalResult = _rentals(method, path, body, user);
    if (rentalResult != null) return rentalResult;
    final paymentResult = _payments(method, path, body, user);
    if (paymentResult != null) return paymentResult;
    final bookingResult = _bookings(method, path, body, query, user);
    if (bookingResult != null) return bookingResult;
    final chatResult = _chat(method, path, body, query, user);
    if (chatResult != null) return chatResult;
    return _error(404, 'NOT_FOUND', 'Cannot $method $path');
  }

  (int, Object?) _discovery(
    String path,
    Map<String, String> query,
    _User? viewer,
  ) {
    final lat = double.tryParse(query['lat'] ?? '');
    final lng = double.tryParse(query['lng'] ?? '');
    double? meters(FakeListing l) => lat == null || lng == null
        ? null
        : _haversine(
            lat,
            lng,
            l.fields['lat'] as double,
            l.fields['lng'] as double,
          );
    final live = [
      for (final l in listings.values.toList().reversed) // newest first
        if (l.status == 'LIVE' && !_users[l.lenderId]!.suspended) l,
    ];

    if (path == '/home') {
      final near = [
        for (final l in live)
          if ((meters(l) ?? double.infinity) <= 10000) l,
      ]..sort((a, b) => meters(a)!.compareTo(meters(b)!));
      int score(FakeListing l) =>
          (views[l.id] ?? 0) +
          3 * favorites.values.where((ids) => ids.contains(l.id)).length;
      final popular = [
        for (final l in live)
          if (score(l) > 0) l,
      ]..sort((a, b) => score(b).compareTo(score(a)));
      return (
        200,
        {
          'categories': [for (final c in categories) c],
          'nearYou': [
            for (final l in near.take(10)) _card(l, viewer, meters: meters(l)),
          ],
          'popularThisWeek': [
            for (final l in popular.take(10))
              _card(l, viewer, meters: meters(l)),
          ],
          'newest': [
            for (final l in live.take(10)) _card(l, viewer, meters: meters(l)),
          ],
        },
      );
    }

    if (path == '/listings') {
      final ids = (query['ids'] ?? '').split(',');
      return (
        200,
        [
          for (final id in ids)
            if (live.any((l) => l.id == id)) _card(listings[id]!, viewer),
        ],
      );
    }

    if (path == '/search') {
      final radius = double.parse(query['radiusKm'] ?? '5') * 1000;
      final q = (query['q'] ?? '').toLowerCase().trim();
      final conditions = query['condition']?.split(',');
      final start = query['startDate'] == null
          ? null
          : DateTime.parse(query['startDate']!);
      final end = query['endDate'] == null
          ? null
          : DateTime.parse(query['endDate']!);
      final days = start == null ? null : end!.difference(start).inDays + 1;
      bool matches(FakeListing l) {
        final f = l.fields;
        final m = meters(l);
        if (m != null && m > radius) return false;
        if (q.isNotEmpty) {
          final hay = '${f['title']} ${f['description']} ${f['brand'] ?? ''}'
              .toLowerCase();
          // Crude stemming, like Postgres' english config: "tents" ≈ "tent".
          final words = q.split(RegExp(r'\s+'));
          if (!words.every(
            (w) => hay.contains(
              w.endsWith('s') ? w.substring(0, w.length - 1) : w,
            ),
          )) {
            return false;
          }
        }
        if (query['categoryId'] != null &&
            f['categoryId'] != query['categoryId']) {
          return false;
        }
        final price = f['pricePerDayPaise'] as int;
        final min = int.tryParse(query['minPricePaise'] ?? '');
        final max = int.tryParse(query['maxPricePaise'] ?? '');
        if (min != null && price < min) return false;
        if (max != null && price > max) return false;
        if (conditions != null && !conditions.contains(f['condition'])) {
          return false;
        }
        if (query['verifiedLendersOnly'] == 'true' &&
            !(_users[l.lenderId]!.json['idVerified'] as bool)) {
          return false;
        }
        if (start != null) {
          final quote = _quote(l, start, end!);
          if (!(quote['available'] as bool)) return false;
        }
        return true;
      }

      final sort =
          query['sort'] ??
          (lat != null ? 'distance' : (q.isNotEmpty ? 'relevance' : 'newest'));
      final found = live.where(matches).toList();
      int price(FakeListing l) => l.fields['pricePerDayPaise'] as int;
      switch (sort) {
        case 'distance':
          found.sort((a, b) => meters(a)!.compareTo(meters(b)!));
        case 'price_asc':
          found.sort((a, b) => price(a).compareTo(price(b)));
        case 'price_desc':
          found.sort((a, b) => price(b).compareTo(price(a)));
      }
      final offset = int.tryParse(query['cursor'] ?? '') ?? 0;
      final limit = int.tryParse(query['limit'] ?? '') ?? searchPageSize;
      final page = found.skip(offset).take(limit).toList();
      final next = offset + page.length;
      return (
        200,
        {
          'items': [
            for (final l in page)
              _card(l, viewer, meters: meters(l), days: days),
          ],
          'nextCursor': next < found.length ? '$next' : null,
          'sort': sort,
        },
      );
    }

    // /listings/:id and /listings/:id/quote
    final parts = path.split('/'); // ['', 'listings', id, 'quote'?]
    final l = listings[parts[2]];
    if (l == null || !live.contains(l)) {
      return _error(404, 'NOT_FOUND', 'Listing not found');
    }
    if (parts.length == 4 && parts[3] == 'quote') {
      return (
        200,
        _quote(
          l,
          DateTime.parse(query['startDate']!),
          DateTime.parse(query['endDate']!),
        ),
      );
    }
    if (viewer?.id != l.lenderId) views[l.id] = (views[l.id] ?? 0) + 1;
    final lender = _users[l.lenderId]!;
    final json = l.json;
    return (
      200,
      {
        for (final k in [
          'id',
          'category',
          'title',
          'description',
          'condition',
          'brand',
          'size',
          'pricePerDayPaise',
          'weeklyDiscountPct',
          'depositPaise',
          'minDays',
          'maxDays',
          'advanceNoticeDays',
          'areaLabel',
          'photos',
          'requiredDocs',
          'blocks',
        ])
          k: json[k],
        'approxLat': ((l.fields['lat'] as double) * 100).round() / 100,
        'approxLng': ((l.fields['lng'] as double) * 100).round() / 100,
        'lender': {
          'id': lender.id,
          'name': lender.name,
          'avatarUrl': lender.avatarUrl,
          'city': lender.city,
          'phoneVerified': true,
          'emailVerified': lender.emailVerified,
          'idVerified': lender.json['idVerified'],
          'memberSince': '2026-09-01T10:00:00.000Z',
          'ratingAvg': _reviewPage(false, lender.id)['ratingAvg'],
          'ratingCount': _reviewPage(false, lender.id)['ratingCount'],
        },
        'saved': favorites[viewer?.id]?.contains(l.id) ?? false,
        'favoriteCount': favorites.values
            .where((ids) => ids.contains(l.id))
            .length,
        'ratingAvg': _reviewPage(true, l.id)['ratingAvg'],
        'ratingCount': _reviewPage(true, l.id)['ratingCount'],
      },
    );
  }

  /// Results per search page.
  int searchPageSize = 20;

  Map<String, dynamic> _card(
    FakeListing l,
    _User? viewer, {
    double? meters,
    int? days,
  }) {
    final f = l.fields;
    final lender = _users[l.lenderId]!;
    final price = f['pricePerDayPaise'] as int;
    final before = days == null ? null : price * days;
    final discount = days != null && days >= 7
        ? (before! * (f['weeklyDiscountPct'] as int? ?? 0) / 100).round()
        : 0;
    return {
      'id': l.id,
      'title': f['title'],
      'category': categories.firstWhere((c) => c['id'] == f['categoryId']),
      'thumbUrl': l.photos.firstOrNull?['thumbUrl'],
      'pricePerDayPaise': price,
      'weeklyDiscountPct': f['weeklyDiscountPct'] ?? 0,
      'depositPaise': f['depositPaise'],
      'areaLabel': f['areaLabel'],
      'distanceKm': meters == null
          ? null
          : (meters < 1000 ? 0.5 : (meters / 500).round() / 2),
      'lender': {
        'id': lender.id,
        'name': lender.name,
        'avatarUrl': lender.avatarUrl,
        'idVerified': lender.json['idVerified'],
      },
      'saved': favorites[viewer?.id]?.contains(l.id) ?? false,
      'available': l.status == 'LIVE',
      'rentPaise': before == null ? null : before - discount,
      'days': days,
    };
  }

  /// Same rules as the API's `pricing.ts`.
  Map<String, dynamic> _quote(FakeListing l, DateTime start, DateTime end) {
    final f = l.fields;
    final days = end.difference(start).inDays + 1;
    final price = f['pricePerDayPaise'] as int;
    final before = price * days;
    final discount = days >= 7
        ? (before * (f['weeklyDiscountPct'] as int? ?? 0) / 100).round()
        : 0;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final blocked = l.blocks.any((b) {
      final m = b as Map;
      return !DateTime.parse(m['startsOn'] as String).isAfter(end) &&
          !DateTime.parse(m['endsOn'] as String).isBefore(start);
    });
    final reason = days < (f['minDays'] as int)
        ? 'TOO_SHORT'
        : days > (f['maxDays'] as int)
        ? 'TOO_LONG'
        : start.isBefore(
            today.add(Duration(days: f['advanceNoticeDays'] as int)),
          )
        ? 'NOT_ENOUGH_NOTICE'
        : blocked
        ? 'BLOCKED'
        : null;
    final deposit = f['depositPaise'] as int;
    return {
      'days': days,
      'pricePerDayPaise': price,
      'rentBeforeDiscountPaise': before,
      'weeklyDiscountPaise': discount,
      'rentPaise': before - discount,
      'feePaise': 0,
      'depositPaise': deposit,
      'totalPaise': before - discount + deposit,
      'available': reason == null,
      'unavailableReason': reason,
    };
  }

  static double _haversine(double lat1, double lng1, double lat2, double lng2) {
    double rad(double d) => d * math.pi / 180;
    final dLat = rad(lat2 - lat1);
    final dLng = rad(lng2 - lng1);
    final a =
        math.pow(math.sin(dLat / 2), 2) +
        math.cos(rad(lat1)) *
            math.cos(rad(lat2)) *
            math.pow(math.sin(dLng / 2), 2);
    return 6371000 * 2 * math.asin(math.sqrt(a));
  }

  /// Consumes an upload the user PUT to storage, like the API's finalise step.
  _Upload? _claim(_User user, Object? key, String purpose) {
    final upload = _uploads[key];
    if (upload == null ||
        upload.userId != user.id ||
        upload.purpose != purpose ||
        !upload.uploaded) {
      return null;
    }
    return _uploads.remove(key);
  }

  Map<String, dynamic> _challenge(String target, String? userId) {
    final id = 'challenge-${++_seq}';
    _challenges[id] = _Challenge(target);
    return {'challengeId': id, 'expiresInSec': 300, 'resendAfterSec': 30};
  }

  (int, Object?)? _checkCode(_Challenge? challenge, String code) {
    if (challenge == null || challenge.used) {
      return _error(400, 'OTP_EXPIRED', 'Expired');
    }
    if (challenge.attempts >= 5) {
      return _error(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many');
    }
    challenge.attempts++;
    if (code != FakeSajhaApi.code) {
      final left = 5 - challenge.attempts;
      return left == 0
          ? _error(429, 'OTP_TOO_MANY_ATTEMPTS', 'Too many')
          : _error(400, 'OTP_INVALID', 'Wrong code', {'attemptsLeft': left});
    }
    challenge.used = true;
    return null;
  }

  _User _createUser(String phone) {
    final user = _User('user-${++_seq}', phone)..api = this;
    _users[user.id] = user;
    return user;
  }

  _Session _newSession(String userId, {String? deviceName, String? platform}) {
    final s = _Session(
      'session-${++_seq}',
      userId,
      'refresh-${++_seq}',
      deviceName ?? 'Pixel 8',
      platform ?? 'android',
    )..access.add('access-${++_seq}');
    _sessions[s.id] = s;
    return s;
  }

  (int, Object?) _error(
    int status,
    String code,
    String message, [
    Map<String, dynamic>? details,
  ]) => (
    status,
    {
      'error': {'code': code, 'message': message, 'details': ?details},
    },
  );
}

class _User {
  _User(this.id, this.phone);
  final String id;
  final String phone;
  String? name;
  String? email;
  bool emailVerified = false;
  bool suspended = false;
  String? city;
  String? bio;
  String? avatarUrl;
  bool idVerifiedFlag = false;
  FakeSajhaApi? api;

  Map<String, dynamic> get json => {
    'id': id,
    'phone': phone,
    'email': email,
    'name': name,
    'city': city,
    'bio': bio,
    'avatarUrl': avatarUrl,
    'idVerified':
        idVerifiedFlag ||
        (api?.documents.values.any(
              (d) => d.userId == id && d.status == 'APPROVED',
            ) ??
            false),
    'status': suspended ? 'SUSPENDED' : 'ACTIVE',
    'phoneVerified': true,
    'emailVerified': emailVerified,
    'createdAt': '2026-09-01T10:00:00.000Z',
  };
}

class _Session {
  _Session(this.id, this.userId, this.refresh, this.deviceName, this.platform);
  final String id;
  final String userId;
  String refresh;
  final String deviceName;
  final String platform;
  final access = <String>[];
  bool revoked = false;
}

class _Challenge {
  _Challenge(this.target);
  final String target;
  int attempts = 0;
  bool used = false;
}

class _Upload {
  _Upload(this.userId, this.purpose, this.contentType, this.size);
  final String userId;
  final String purpose;
  final String contentType;
  final int size;
  bool uploaded = false;
}

class FakeDocument {
  FakeDocument(
    this.id,
    this.userId,
    this.type, {
    this.label,
    this.hasBack = false,
    this.expiresOn,
  });
  final String id;
  final String userId;
  final String type;
  final String? label;
  final bool hasBack;
  final String? expiresOn;
  String status = 'PENDING';
  String? rejectionReason;

  Map<String, dynamic> get json => {
    'id': id,
    'type': type,
    'label': label,
    'status': status,
    'rejectionReason': rejectionReason,
    'hasBack': hasBack,
    'expiresOn': expiresOn,
    'createdAt': '2026-09-24T10:00:00.000Z',
    'reviewedAt': status == 'PENDING' ? null : '2026-09-24T11:00:00.000Z',
  };
}

class FakeListing {
  FakeListing(this.id, this.lenderId);
  final String id;
  final String lenderId;
  final fields = <String, dynamic>{};
  final photos = <Map<String, dynamic>>[];
  List<dynamic> blocks = [];
  List<dynamic> requiredDocs = [];
  String status = 'DRAFT';
  String? rejectionReason;

  String get title => fields['title'] as String;

  Map<String, dynamic> get json => {
    'id': id,
    'category': FakeSajhaApi.categories.firstWhere(
      (c) => c['id'] == fields['categoryId'],
    ),
    'title': fields['title'],
    'description': fields['description'],
    'condition': fields['condition'],
    'brand': (fields['brand'] as String?)?.isEmpty ?? true
        ? null
        : fields['brand'],
    'size': (fields['size'] as String?)?.isEmpty ?? true
        ? null
        : fields['size'],
    'pricePerDayPaise': fields['pricePerDayPaise'],
    'weeklyDiscountPct': fields['weeklyDiscountPct'] ?? 0,
    'depositPaise': fields['depositPaise'],
    'minDays': fields['minDays'] ?? 1,
    'maxDays': fields['maxDays'] ?? 30,
    'advanceNoticeDays': fields['advanceNoticeDays'] ?? 1,
    'lat': fields['lat'],
    'lng': fields['lng'],
    'areaLabel': fields['areaLabel'],
    'exactAddress': (fields['exactAddress'] as String?)?.isEmpty ?? true
        ? null
        : fields['exactAddress'],
    'status': status,
    'rejectionReason': rejectionReason,
    'photos': photos,
    'requiredDocs': [
      for (final d in requiredDocs)
        {'docType': (d as Map)['docType'], 'note': d['note']},
    ],
    'blocks': blocks,
    'publishedAt': null,
    'createdAt': '2026-09-24T10:00:00.000Z',
    'updatedAt': '2026-09-24T10:00:00.000Z',
  };
}
