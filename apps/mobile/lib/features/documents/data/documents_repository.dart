import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/upload_client.dart';
import 'models.dart';

/// The user's document vault (`/v1/me/documents`). Throws [ApiException].
class DocumentsRepository {
  DocumentsRepository({required this._dio, required this._uploads});

  final Dio _dio;
  final UploadClient _uploads;

  Future<List<UserDocument>> list() async {
    final data = await _call(() => _dio.get<List<dynamic>>('/me/documents'));
    return data
        .map((d) => UserDocument.fromJson(d as Map<String, dynamic>))
        .toList();
  }

  /// Uploads the photos, then submits the document for review.
  /// [onProgress] reports 0–1 across all photos.
  Future<UserDocument> add({
    required DocumentType type,
    required Uint8List front,
    Uint8List? back,
    String? label,
    DateTime? expiresOn,
    void Function(double progress)? onProgress,
  }) async {
    final photos = [front, ?back];
    final keys = <String>[];
    for (final (i, photo) in photos.indexed) {
      keys.add(
        await _uploads.upload(
          UploadPurpose.document,
          photo,
          onProgress: onProgress == null
              ? null
              : (p) => onProgress((i + p) / photos.length),
        ),
      );
    }
    final body = {
      'type': type.apiValue,
      'frontKey': keys.first,
      if (keys.length > 1) 'backKey': keys[1],
      if (label != null && label.trim().isNotEmpty) 'label': label.trim(),
      if (expiresOn != null) 'expiresOn': _date(expiresOn),
    };
    return UserDocument.fromJson(
      await _call(
        () => _dio.post<Map<String, dynamic>>('/me/documents', data: body),
      ),
    );
  }

  /// A short-lived URL to one side of the document. Every view is logged.
  Future<String> viewUrl(String id, DocumentSide side) async {
    final data = await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/me/documents/$id/view',
        queryParameters: {'side': side.name},
      ),
    );
    return data['url'] as String;
  }

  Future<void> delete(String id) =>
      _call(() => _dio.delete<void>('/me/documents/$id'));

  static String _date(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final documentsRepositoryProvider = Provider<DocumentsRepository>(
  (ref) => DocumentsRepository(
    dio: ref.watch(dioProvider),
    uploads: ref.watch(uploadClientProvider),
  ),
);
