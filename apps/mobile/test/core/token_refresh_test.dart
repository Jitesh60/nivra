import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/network/api_exception.dart';
import 'package:sajha/core/network/auth_interceptor.dart';
import 'package:sajha/core/network/token_manager.dart';

import '../helpers/fake_api.dart';
import '../helpers/fakes.dart';

void main() {
  late FakeSajhaApi api;
  late InMemorySessionStorage storage;
  late TokenManager tokens;
  late Dio dio;
  final ended = <SessionEndReason>[];

  Dio newDio() =>
      Dio(BaseOptions(baseUrl: 'http://api.test/v1'))..httpClientAdapter = api;

  setUp(() async {
    api = FakeSajhaApi();
    storage = InMemorySessionStorage(refreshToken: api.seedSession());
    tokens = TokenManager(dio: newDio(), store: storage)
      ..onSessionEnded = ended.add;
    ended.clear();
    dio = newDio();
    dio.interceptors.add(AuthInterceptor(tokens, dio));
    await tokens.refresh(); // obtain an access token
    api.requests.clear();
  });

  test(
    'refreshes once and retries when the access token has expired',
    () async {
      api.expireAccessTokens();
      final res = await dio.get<Map<String, dynamic>>('/me');
      expect(res.data!['user'], isNotNull);
      expect(api.requests, ['GET /me', 'POST /auth/refresh', 'GET /me']);
    },
  );

  test('concurrent 401s share a single refresh', () async {
    api.expireAccessTokens();
    await Future.wait([
      dio.get<dynamic>('/me'),
      dio.get<dynamic>('/me/sessions'),
      dio.get<dynamic>('/me'),
    ]);
    expect(api.refreshCalls, 1);
  });

  test('ends the session when the server has revoked it', () async {
    api.revokeAllSessions();
    await expectLater(dio.get<dynamic>('/me'), throwsA(isA<DioException>()));
    expect(ended, [SessionEndReason.expired]);
    expect(storage.refreshToken, isNull);
    expect(tokens.accessToken, isNull);
  });

  test('reports suspension', () async {
    api.suspendAll();
    await expectLater(dio.get<dynamic>('/me'), throwsA(isA<DioException>()));
    expect(ended, [SessionEndReason.suspended]);
    expect(storage.refreshToken, isNull);
  });

  test('keeps the session when refresh fails because of the network', () async {
    final stored = storage.refreshToken;
    api.offline = true;
    await expectLater(tokens.refresh(), throwsA(isA<ApiException>()));
    expect(storage.refreshToken, stored);
    expect(ended, isEmpty);
  });

  test('does not try to refresh requests sent without a token', () async {
    await tokens.clear();
    await expectLater(dio.get<dynamic>('/me'), throwsA(isA<DioException>()));
    expect(api.refreshCalls, 0);
  });
}
