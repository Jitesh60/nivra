import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'api_exception.dart';

enum UploadPurpose { avatar, document }

/// "image/jpeg" etc. from the file's first bytes, or null if it isn't a
/// JPEG, PNG or WebP (the only types the API accepts).
String? sniffImageType(Uint8List bytes) {
  bool startsWith(List<int> sig, [int offset = 0]) =>
      bytes.length >= offset + sig.length &&
      Iterable<int>.generate(sig.length)
          .every((i) => bytes[offset + i] == sig[i]);
  if (startsWith([0xFF, 0xD8, 0xFF])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return 'image/png';
  }
  if (startsWith('RIFF'.codeUnits) && startsWith('WEBP'.codeUnits, 8)) {
    return 'image/webp';
  }
  return null;
}

/// Uploads a photo in two steps: `POST /v1/uploads` for a presigned URL,
/// then a PUT of the bytes straight to storage. Returns the upload key to
/// hand to the endpoint that uses the file.
class UploadClient {
  UploadClient({required this._api, required this._storage});

  /// The authenticated API client.
  final Dio _api;

  /// A bare client for storage: the presigned URL is the credential, so it
  /// must never carry the Bearer token or go through token refresh.
  final Dio _storage;

  Future<String> upload(
    UploadPurpose purpose,
    Uint8List bytes, {
    void Function(double progress)? onProgress,
  }) async {
    final contentType = sniffImageType(bytes);
    if (contentType == null) {
      throw const ApiException(
        code: 'UPLOAD_INVALID',
        message: 'Choose a JPEG, PNG or WebP photo.',
      );
    }
    final Map<String, dynamic> ticket;
    try {
      ticket = (await _api.post<Map<String, dynamic>>(
        '/uploads',
        data: {
          'purpose': purpose.name.toUpperCase(),
          'contentType': contentType,
          'sizeBytes': bytes.length,
        },
      )).data!;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }

    try {
      await _storage.put<void>(
        ticket['url'] as String,
        data: Stream.value(bytes),
        options: Options(
          // Both headers are part of the signature.
          headers: {
            ...Map<String, dynamic>.from(ticket['headers'] as Map),
            Headers.contentLengthHeader: bytes.length,
          },
          sendTimeout: const Duration(minutes: 2),
        ),
        onSendProgress: onProgress == null
            ? null
            : (sent, total) => onProgress(total > 0 ? sent / total : 0),
      );
    } on DioException catch (e) {
      // Storage answers in XML, not the API's error shape.
      if (e.response == null) throw ApiException.fromDio(e);
      throw ApiException(
        code: 'UPLOAD_FAILED',
        message: 'The upload didn’t go through. Please try again.',
        status: e.response?.statusCode,
      );
    }
    return ticket['key'] as String;
  }
}

final uploadClientProvider = Provider<UploadClient>((ref) {
  final storage = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );
  final adapter = ref.watch(httpClientAdapterProvider);
  if (adapter != null) storage.httpClientAdapter = adapter;
  ref.onDispose(storage.close);
  return UploadClient(api: ref.watch(dioProvider), storage: storage);
});
