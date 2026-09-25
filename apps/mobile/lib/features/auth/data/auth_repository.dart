import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/device/device_info.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/token_manager.dart';
import '../../../core/storage/session_storage.dart';
import 'models.dart';

/// All auth and account calls to the Nivra API. Throws [ApiException].
class AuthRepository {
  AuthRepository({
    required this._dio,
    required this._tokens,
    required this._store,
    required this._device,
  });

  final Dio _dio;
  final TokenManager _tokens;
  final SessionStorage _store;
  final DeviceInfoService _device;

  /// [phone] is the 10-digit national number.
  Future<OtpChallenge> requestPhoneOtp(String phone) async =>
      OtpChallenge.fromJson(
        await _post('/auth/otp/request', {'phone': '+91$phone'}),
      );

  Future<LoginResult> verifyPhoneOtp(String challengeId, String code) async {
    final device = await _device.describe();
    final result = LoginResult.fromJson(
      await _post('/auth/otp/verify', {
        'challengeId': challengeId,
        'code': code,
        'deviceId': await _store.deviceId(),
        'deviceName': device.name,
        'platform': device.platform,
      }),
    );
    await _tokens.save(
      AuthTokens(
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      ),
    );
    return result;
  }

  Future<OtpChallenge> requestEmailOtp(String email) async =>
      OtpChallenge.fromJson(
        await _post('/auth/email/otp/request', {'email': email}),
      );

  Future<AppUser> verifyEmailOtp(String challengeId, String code) async =>
      _user(
        await _post('/auth/email/otp/verify', {
          'challengeId': challengeId,
          'code': code,
        }),
      );

  /// Restores a stored session at app start. Returns null when there is none
  /// (or it has ended); throws [ApiException] on network errors.
  Future<AppUser?> restoreSession() async {
    if (!await _tokens.hasStoredSession()) return null;
    final access = await _tokens.refresh();
    if (access == null) return null;
    return me();
  }

  Future<AppUser> me() async => _user(await _get('/me'));

  Future<AppUser> updateName(String name) async =>
      _user(await _send('PATCH', '/me', {'name': name}));

  Future<List<DeviceSession>> sessions() async {
    final data = await _call(() => _dio.get<List<dynamic>>('/me/sessions'));
    return data
        .map((s) => DeviceSession.fromJson(s as Map<String, dynamic>))
        .toList();
  }

  Future<void> revokeSession(String id) =>
      _call(() => _dio.delete<void>('/me/sessions/$id'));

  /// Signs out on the server, then always clears local tokens.
  Future<void> logout({bool everywhere = false}) async {
    try {
      await _call(
        () => _dio.post<void>(everywhere ? '/auth/logout-all' : '/auth/logout'),
      );
    } on ApiException catch (e) {
      // Already signed out on the server, or offline: still sign out locally.
      if (!e.isNetwork && e.status != 401) rethrow;
    } finally {
      await _tokens.clear();
    }
  }

  Future<void> deleteAccount() async {
    await _call(() => _dio.delete<void>('/me'));
    await _tokens.clear();
  }

  AppUser _user(Map<String, dynamic> body) =>
      AppUser.fromJson(body['user'] as Map<String, dynamic>);

  Future<Map<String, dynamic>> _post(String path, Map<String, dynamic> body) =>
      _send('POST', path, body);

  Future<Map<String, dynamic>> _get(String path) =>
      _call(() => _dio.get<Map<String, dynamic>>(path)).then((d) => d);

  Future<Map<String, dynamic>> _send(
    String method,
    String path,
    Map<String, dynamic> body,
  ) => _call(
    () => _dio.request<Map<String, dynamic>>(
      path,
      data: body,
      options: Options(method: method),
    ),
  );

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      final res = await request();
      return res.data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    dio: ref.watch(dioProvider),
    tokens: ref.watch(tokenManagerProvider),
    store: ref.watch(sessionStorageProvider),
    device: ref.watch(deviceInfoProvider),
  ),
);
