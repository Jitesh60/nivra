import 'dart:async';

import 'package:dio/dio.dart';

import '../storage/session_storage.dart';
import 'api_exception.dart';

class AuthTokens {
  const AuthTokens({required this.accessToken, required this.refreshToken});

  factory AuthTokens.fromJson(Map<String, dynamic> json) => AuthTokens(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
  );

  final String accessToken;
  final String refreshToken;
}

/// Why the session ended without the user asking.
enum SessionEndReason { expired, suspended }

/// Holds the access token in memory and the refresh token in secure storage.
///
/// [refresh] is single-flight: when several requests hit 401 at once, only one
/// refresh call is made and they all wait for it. The server rotates refresh
/// tokens, so two parallel refreshes would sign the device out.
class TokenManager {
  TokenManager({required this._dio, required this._store});

  final Dio _dio;
  final SessionStorage _store;
  String? _accessToken;
  Future<String?>? _inFlight;

  /// Called when a refresh proves the session is gone (revoked, expired, suspended).
  void Function(SessionEndReason reason)? onSessionEnded;

  String? get accessToken => _accessToken;

  Future<bool> hasStoredSession() async =>
      await _store.readRefreshToken() != null;

  Future<void> save(AuthTokens tokens) async {
    _accessToken = tokens.accessToken;
    await _store.writeRefreshToken(tokens.refreshToken);
  }

  Future<void> clear() async {
    _accessToken = null;
    await _store.clearRefreshToken();
  }

  /// Returns a fresh access token, or null if the session is over (and then
  /// clears it and calls [onSessionEnded]). Network errors are rethrown as
  /// [ApiException] without signing the user out.
  Future<String?> refresh() => _inFlight ??= _refresh().whenComplete(() {
    _inFlight = null;
  });

  Future<String?> _refresh() async {
    final refreshToken = await _store.readRefreshToken();
    if (refreshToken == null) {
      _accessToken = null;
      return null;
    }
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final tokens = AuthTokens.fromJson(res.data!);
      await save(tokens);
      return tokens.accessToken;
    } on DioException catch (e) {
      final error = ApiException.fromDio(e);
      if (error.isNetwork || (error.status ?? 0) >= 500) throw error;
      await clear();
      onSessionEnded?.call(
        error.code == 'ACCOUNT_SUSPENDED'
            ? SessionEndReason.suspended
            : SessionEndReason.expired,
      );
      return null;
    }
  }
}
