import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/providers.dart';
import '../storage/session_storage.dart';
import 'auth_interceptor.dart';
import 'token_manager.dart';

/// Test seam: tests swap in a fake adapter to serve responses in memory.
final httpClientAdapterProvider = Provider<HttpClientAdapter?>((ref) => null);

Dio _baseDio(Ref ref) {
  final config = ref.watch(appConfigProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: '${config.apiBaseUrl}/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept': 'application/json'},
    ),
  );
  final adapter = ref.watch(httpClientAdapterProvider);
  if (adapter != null) dio.httpClientAdapter = adapter;
  return dio;
}

/// Access/refresh token handling. Uses its own interceptor-free client so a
/// refresh can never trigger another refresh.
final tokenManagerProvider = Provider<TokenManager>((ref) {
  final refreshDio = _baseDio(ref);
  ref.onDispose(refreshDio.close);
  return TokenManager(
    dio: refreshDio,
    store: ref.watch(sessionStorageProvider),
  );
});

/// Shared HTTP client for the Nivra API (`/v1`), with auth and token refresh.
final dioProvider = Provider<Dio>((ref) {
  final dio = _baseDio(ref);
  dio.interceptors.add(AuthInterceptor(ref.watch(tokenManagerProvider), dio));
  ref.onDispose(dio.close);
  return dio;
});
