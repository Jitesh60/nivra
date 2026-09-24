import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/upload_client.dart';
import '../../bookings/data/models.dart';

/// The rental: codes, handover and return with condition photos, no-show,
/// disputes and reviews. Throws [ApiException].
class RentalsRepository {
  RentalsRepository({required this._dio, required this._uploads});

  final Dio _dio;
  final UploadClient _uploads;

  /// The code the viewer shows the other person.
  Future<BookingCode> code(String bookingId) async => BookingCode.fromJson(
    await _call(
      () => _dio.get<Map<String, dynamic>>('/bookings/$bookingId/code'),
    ),
  );

  /// Lender: the borrower's code and photos of the item as it leaves.
  Future<BookingDetail> handOver(
    String bookingId, {
    required String code,
    required List<Uint8List> photos,
    String? note,
    void Function(double progress)? onProgress,
  }) async {
    final keys = await _upload(photos, onProgress);
    return _detail(
      () => _dio.post<Map<String, dynamic>>(
        '/bookings/$bookingId/handover',
        data: {
          'code': code,
          'photoKeys': keys,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        },
      ),
    );
  }

  /// Borrower: the lender's code and photos of the item as it comes back.
  Future<BookingDetail> returnItem(
    String bookingId, {
    required String code,
    required List<Uint8List> photos,
    String? note,
    void Function(double progress)? onProgress,
  }) async {
    final keys = await _upload(photos, onProgress);
    return _detail(
      () => _dio.post<Map<String, dynamic>>(
        '/bookings/$bookingId/return',
        data: {
          'code': code,
          'photoKeys': keys,
          if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        },
      ),
    );
  }

  Future<BookingDetail> addPhotos(
    String bookingId,
    RentalStage stage,
    List<Uint8List> photos, {
    void Function(double progress)? onProgress,
  }) async {
    final keys = await _upload(photos, onProgress);
    return _detail(
      () => _dio.post<Map<String, dynamic>>(
        '/bookings/$bookingId/photos',
        data: {'stage': stage.apiValue, 'photoKeys': keys},
      ),
    );
  }

  Future<BookingDetail> noShow(String bookingId, {String? note}) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/bookings/$bookingId/no-show',
      data: {if (note != null && note.trim().isNotEmpty) 'reason': note.trim()},
    ),
  );

  /// Lender: claim part of the deposit.
  Future<BookingDetail> openDispute(
    String bookingId, {
    required DisputeReason reason,
    required String description,
    required int claimPaise,
    required List<Uint8List> photos,
    void Function(double progress)? onProgress,
  }) async {
    final keys = await _upload(photos, onProgress);
    return _detail(
      () => _dio.post<Map<String, dynamic>>(
        '/bookings/$bookingId/dispute',
        data: {
          'reason': reason.apiValue,
          'description': description.trim(),
          'claimPaise': claimPaise,
          'photoKeys': keys,
        },
      ),
    );
  }

  /// Borrower: your side of the claim (once).
  Future<BookingDetail> respondToDispute(
    String bookingId, {
    required String note,
    required List<Uint8List> photos,
    void Function(double progress)? onProgress,
  }) async {
    final keys = await _upload(photos, onProgress);
    return _detail(
      () => _dio.post<Map<String, dynamic>>(
        '/bookings/$bookingId/dispute/response',
        data: {'note': note.trim(), 'photoKeys': keys},
      ),
    );
  }

  Future<BookingDetail> review(
    String bookingId, {
    required int rating,
    String? comment,
  }) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/bookings/$bookingId/review',
      data: {
        'rating': rating,
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      },
    ),
  );

  /// Borrowers' published reviews of an item.
  Future<ReviewPage> listingReviews(String listingId, {String? cursor}) async =>
      ReviewPage.fromJson(
        await _call(
          () => _dio.get<Map<String, dynamic>>(
            '/listings/$listingId/reviews',
            queryParameters: {'cursor': ?cursor},
          ),
        ),
      );

  /// Published reviews of a person.
  Future<ReviewPage> userReviews(String userId, {String? cursor}) async =>
      ReviewPage.fromJson(
        await _call(
          () => _dio.get<Map<String, dynamic>>(
            '/users/$userId/reviews',
            queryParameters: {'cursor': ?cursor},
          ),
        ),
      );

  /// Uploads photos one after another; progress spans all of them.
  Future<List<String>> _upload(
    List<Uint8List> photos,
    void Function(double progress)? onProgress,
  ) async {
    final keys = <String>[];
    for (final (i, bytes) in photos.indexed) {
      keys.add(
        await _uploads.upload(
          UploadPurpose.conditionPhoto,
          bytes,
          onProgress: onProgress == null
              ? null
              : (p) => onProgress((i + p) / photos.length),
        ),
      );
    }
    return keys;
  }

  Future<BookingDetail> _detail(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async => BookingDetail.fromJson(await _call(request));

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final rentalsRepositoryProvider = Provider<RentalsRepository>(
  (ref) => RentalsRepository(
    dio: ref.watch(dioProvider),
    uploads: ref.watch(uploadClientProvider),
  ),
);
