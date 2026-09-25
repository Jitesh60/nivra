import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../discovery/application/search_area.dart';
import 'models.dart';

/// The requests board, your own requests and answers to others'.
/// Throws [ApiException].
class RequestsRepository {
  RequestsRepository(this._dio);

  final Dio _dio;

  /// Open requests near [area], nearest first (never your own).
  Future<RequestPage> board(
    SearchArea area, {
    String? categoryId,
    String? cursor,
  }) async => RequestPage.fromJson(
    await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/requests',
        queryParameters: {
          'lat': area.lat,
          'lng': area.lng,
          // The board looks a little further out than search by default.
          'radiusKm': area.radiusKm < 10 ? 10 : area.radiusKm,
          'categoryId': ?categoryId,
          'cursor': ?cursor,
        },
      ),
    ),
  );

  Future<ItemRequestDetail> get(String id) =>
      _detail(() => _dio.get<Map<String, dynamic>>('/requests/$id'));

  Future<List<ItemRequestDetail>> mine() async => [
    for (final r in await _call(() => _dio.get<List<dynamic>>('/me/requests')))
      ItemRequestDetail.fromJson(r as Map<String, dynamic>),
  ];

  Future<ItemRequestDetail> create(NewRequest request) => _detail(
    () => _dio.post<Map<String, dynamic>>('/requests', data: request.toJson()),
  );

  Future<ItemRequestDetail> close(String id) =>
      _detail(() => _dio.post<Map<String, dynamic>>('/requests/$id/close'));

  /// Offers one of your live listings; the answer starts a chat.
  Future<ItemRequestDetail> respond(
    String id, {
    required String listingId,
    required String message,
  }) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/requests/$id/responses',
      data: {'listingId': listingId, 'message': message},
    ),
  );

  Future<ItemRequestDetail> _detail(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async => ItemRequestDetail.fromJson(await _call(request));

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final requestsRepositoryProvider = Provider<RequestsRepository>(
  (ref) => RequestsRepository(ref.watch(dioProvider)),
);
