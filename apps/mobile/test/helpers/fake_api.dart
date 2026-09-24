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
  int _seq = 0;
  bool offline = false;

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

  (int, Object?) _handle(
    String method,
    String path,
    Map<String, dynamic> body,
    String? auth,
  ) {
    switch ('$method $path') {
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
        user.name = (body['name'] as String).trim();
        return (200, {'user': user.json});
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
    final user = _User('user-${++_seq}', phone);
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

  Map<String, dynamic> get json => {
    'id': id,
    'phone': phone,
    'email': email,
    'name': name,
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
