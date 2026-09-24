import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

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

  /// A listing with one photo in [status], owned by the only seeded user.
  FakeListing seedListing({
    String status = 'LIVE',
    String title = 'Quechua trekking tent',
    String? rejectionReason,
  }) {
    final lender = _users.values.first;
    final l = FakeListing('listing-${++_seq}', lender.id)
      ..fields.addAll({
        'categoryId': 'cat-trek',
        'title': title,
        'description': 'Two-person tent, used on three treks. Pegs included.',
        'condition': 'GOOD',
        'pricePerDayPaise': 15000,
        'weeklyDiscountPct': 10,
        'depositPaise': 100000,
        'minDays': 1,
        'maxDays': 30,
        'advanceNoticeDays': 1,
        'lat': 18.5074,
        'lng': 73.8077,
        'areaLabel': 'Kothrud, Pune',
      })
      ..status = status
      ..rejectionReason = rejectionReason
      ..photos.add(_newPhoto());
    listings[l.id] = l;
    return l;
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
    if (offline) {
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
    final (status, json) = _handle(options.method, path, body, auth);
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

  (int, Object?) _handle(
    String method,
    String path,
    Map<String, dynamic> body,
    String? auth,
  ) {
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
    return _error(404, 'NOT_FOUND', 'Cannot $method $path');
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
        api?.documents.values.any(
          (d) => d.userId == id && d.status == 'APPROVED',
        ) ??
        false,
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
