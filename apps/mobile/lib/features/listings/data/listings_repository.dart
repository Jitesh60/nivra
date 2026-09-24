import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/upload_client.dart';
import 'models.dart';

/// Categories, marketplace rules and the lender's listings. Throws [ApiException].
class ListingsRepository {
  ListingsRepository({required this._dio, required this._uploads});

  final Dio _dio;
  final UploadClient _uploads;

  Future<List<Category>> categories() async => [
    for (final c in await _call(() => _dio.get<List<dynamic>>('/categories')))
      Category.fromJson(c as Map<String, dynamic>),
  ];

  Future<MarketRules> rules() async => MarketRules.fromJson(
    await _call(() => _dio.get<Map<String, dynamic>>('/config')),
  );

  Future<List<MyListing>> mine() async => [
    for (final l in await _call(() => _dio.get<List<dynamic>>('/me/listings')))
      MyListing.fromJson(l as Map<String, dynamic>),
  ];

  Future<MyListing> get(String id) =>
      _listing(() => _dio.get<Map<String, dynamic>>('/me/listings/$id'));

  Future<MyListing> create(Map<String, dynamic> fields) => _listing(
    () => _dio.post<Map<String, dynamic>>('/me/listings', data: fields),
  );

  Future<MyListing> update(String id, Map<String, dynamic> fields) => _listing(
    () => _dio.patch<Map<String, dynamic>>('/me/listings/$id', data: fields),
  );

  /// Uploads [photo] (presigned PUT) and attaches it to the listing.
  Future<MyListing> addPhoto(
    String id,
    Uint8List photo, {
    void Function(double progress)? onProgress,
  }) async {
    final key = await _uploads.upload(
      UploadPurpose.listingPhoto,
      photo,
      onProgress: onProgress,
    );
    return _listing(
      () => _dio.post<Map<String, dynamic>>(
        '/me/listings/$id/photos',
        data: {'key': key},
      ),
    );
  }

  Future<MyListing> deletePhoto(String id, String photoId) => _listing(
    () => _dio.delete<Map<String, dynamic>>('/me/listings/$id/photos/$photoId'),
  );

  Future<MyListing> reorderPhotos(String id, List<String> photoIds) => _listing(
    () => _dio.put<Map<String, dynamic>>(
      '/me/listings/$id/photos/order',
      data: {'ids': photoIds},
    ),
  );

  Future<MyListing> setBlocks(String id, List<BlockedRange> ranges) => _listing(
    () => _dio.put<Map<String, dynamic>>(
      '/me/listings/$id/blocks',
      data: {'ranges': ranges.map((r) => r.toJson()).toList()},
    ),
  );

  Future<MyListing> setRequiredDocs(String id, List<RequiredDoc> docs) =>
      _listing(
        () => _dio.put<Map<String, dynamic>>(
          '/me/listings/$id/required-docs',
          data: {'items': docs.map((d) => d.toJson()).toList()},
        ),
      );

  /// Returns the listing and whether it waits for review (first listing).
  Future<({MyListing listing, bool inReview})> publish(String id) async {
    final data = await _call(
      () => _dio.post<Map<String, dynamic>>('/me/listings/$id/publish'),
    );
    return (
      listing: MyListing.fromJson(data['listing'] as Map<String, dynamic>),
      inReview: data['inReview'] as bool,
    );
  }

  Future<MyListing> pause(String id) =>
      _listing(() => _dio.post<Map<String, dynamic>>('/me/listings/$id/pause'));

  Future<MyListing> unpause(String id) => _listing(
    () => _dio.post<Map<String, dynamic>>('/me/listings/$id/unpause'),
  );

  Future<void> delete(String id) =>
      _call(() => _dio.delete<void>('/me/listings/$id'));

  Future<MyListing> _listing(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async => MyListing.fromJson(await _call(request));

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final listingsRepositoryProvider = Provider<ListingsRepository>(
  (ref) => ListingsRepository(
    dio: ref.watch(dioProvider),
    uploads: ref.watch(uploadClientProvider),
  ),
);

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(listingsRepositoryProvider).categories(),
);

final marketRulesProvider = FutureProvider<MarketRules>(
  (ref) => ref.watch(listingsRepositoryProvider).rules(),
);

final myListingsProvider = FutureProvider.autoDispose<List<MyListing>>(
  (ref) => ref.watch(listingsRepositoryProvider).mine(),
);
