import 'package:dio/dio.dart';

import 'token_manager.dart';

/// Adds the access token to every request. On 401 it refreshes once and
/// retries the request; if the session is gone, the error passes through and
/// [TokenManager.onSessionEnded] has already signed the user out.
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._tokens, this._dio);

  final TokenManager _tokens;
  final Dio _dio;

  static const _retriedKey = 'auth_retried';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _tokens.accessToken;
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final options = err.requestOptions;
    final status = err.response?.statusCode;
    final hadToken = options.headers.containsKey('Authorization');

    if (status == 403 && _code(err) == 'ACCOUNT_SUSPENDED' && hadToken) {
      await _tokens.clear();
      _tokens.onSessionEnded?.call(SessionEndReason.suspended);
      return handler.next(err);
    }

    if (status != 401 || !hadToken || options.extra[_retriedKey] == true) {
      return handler.next(err);
    }

    try {
      final fresh = await _tokens.refresh();
      if (fresh == null) return handler.next(err);
      options.headers['Authorization'] = 'Bearer $fresh';
      options.extra[_retriedKey] = true;
      handler.resolve(await _dio.fetch<dynamic>(options));
    } on DioException catch (e) {
      handler.next(e);
    } catch (_) {
      // Refresh failed because of the network: surface the original error.
      handler.next(err);
    }
  }

  static String? _code(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      return (data['error'] as Map)['code']?.toString();
    }
    return null;
  }
}
