import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists the refresh token and a stable per-install device id.
/// The access token is never persisted; it lives in memory only.
abstract class SessionStorage {
  Future<String?> readRefreshToken();
  Future<void> writeRefreshToken(String token);
  Future<void> clearRefreshToken();

  /// Random id generated on first use and kept for the life of the install.
  Future<String> deviceId();
}

class SecureSessionStorage implements SessionStorage {
  SecureSessionStorage([FlutterSecureStorage? storage])
    : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _refreshKey = 'sajha.refresh_token';
  static const _deviceIdKey = 'sajha.device_id';

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  @override
  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: _refreshKey, value: token);

  @override
  Future<void> clearRefreshToken() => _storage.delete(key: _refreshKey);

  @override
  Future<String> deviceId() async {
    final existing = await _storage.read(key: _deviceIdKey);
    if (existing != null) return existing;
    final id = newDeviceId();
    await _storage.write(key: _deviceIdKey, value: id);
    return id;
  }
}

/// 128 random bits as 32 hex characters.
String newDeviceId() {
  final random = Random.secure();
  return List.generate(
    16,
    (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
  ).join();
}

final sessionStorageProvider = Provider<SessionStorage>(
  (ref) => SecureSessionStorage(),
);
