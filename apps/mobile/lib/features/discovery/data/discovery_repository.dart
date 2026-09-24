import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../listings/data/models.dart';
import '../application/search_area.dart';
import 'models.dart';

/// Search, the home feed, listing pages, quotes and the wishlist.
/// Works signed out; signed in, cards also say whether they're saved.
/// Throws [ApiException].
class DiscoveryRepository {
  DiscoveryRepository(this._dio);

  final Dio _dio;

  Future<SearchPage> search(
    SearchFilters filters, {
    SearchArea? area,
    String? cursor,
  }) async => SearchPage.fromJson(
    await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/search',
        queryParameters: {
          ...filters.toQuery(),
          ...?area?.toQuery(),
          'cursor': ?cursor,
        },
      ),
    ),
  );

  Future<HomeFeed> home({SearchArea? area}) async => HomeFeed.fromJson(
    await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/home',
        queryParameters: {
          if (area != null) 'lat': area.lat,
          if (area != null) 'lng': area.lng,
        },
      ),
    ),
  );

  /// Live listings among [ids], in the same order (for "Recently viewed").
  Future<List<ListingCard>> cards(List<String> ids) async {
    if (ids.isEmpty) return const [];
    return _cards(
      () => _dio.get<List<dynamic>>(
        '/listings',
        queryParameters: {'ids': ids.join(',')},
      ),
    );
  }

  /// Opening a listing counts as a view for "Popular this week".
  Future<PublicListing> listing(String id) async => PublicListing.fromJson(
    await _call(() => _dio.get<Map<String, dynamic>>('/listings/$id')),
  );

  Future<Quote> quote(String id, BlockedRange dates) async => Quote.fromJson(
    await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/listings/$id/quote',
        queryParameters: {
          'startDate': isoDate(dates.start),
          'endDate': isoDate(dates.end),
        },
      ),
    ),
  );

  Future<List<ListingCard>> wishlist() =>
      _cards(() => _dio.get<List<dynamic>>('/me/favorites'));

  Future<void> save(String listingId) =>
      _call(() => _dio.put<void>('/me/favorites/$listingId'));

  Future<void> unsave(String listingId) =>
      _call(() => _dio.delete<void>('/me/favorites/$listingId'));

  Future<List<ListingCard>> _cards(
    Future<Response<List<dynamic>>> Function() request,
  ) async => [
    for (final c in await _call(request))
      ListingCard.fromJson(c as Map<String, dynamic>),
  ];

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final discoveryRepositoryProvider = Provider<DiscoveryRepository>(
  (ref) => DiscoveryRepository(ref.watch(dioProvider)),
);
