import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/providers.dart';

/// Shared HTTP client for the Sajha API (`/v1`).
/// Auth and token-refresh interceptors are added in Phase 1b.
final dioProvider = Provider<Dio>((ref) {
  final config = ref.watch(appConfigProvider);
  final dio = Dio(
    BaseOptions(
      baseUrl: '${config.apiBaseUrl}/v1',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept': 'application/json'},
    ),
  );
  ref.onDispose(dio.close);
  return dio;
});

/// `true` when `GET /v1/health` reports every dependency up.
final apiHealthyProvider = FutureProvider.autoDispose<bool>((ref) async {
  try {
    final res = await ref
        .watch(dioProvider)
        .get<Map<String, dynamic>>('/health');
    return res.data?['status'] == 'ok';
  } on DioException {
    return false;
  }
});
