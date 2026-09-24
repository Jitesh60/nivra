import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/upload_client.dart';
import '../../auth/data/models.dart';

/// Profile edits and the profile photo. Throws [ApiException].
class ProfileRepository {
  ProfileRepository({required this._dio, required this._uploads});

  final Dio _dio;
  final UploadClient _uploads;

  /// Only the fields passed are changed; an empty string clears city or bio.
  Future<AppUser> update({String? name, String? city, String? bio}) =>
      _user('PATCH', '/me', {'name': ?name, 'city': ?city, 'bio': ?bio});

  Future<AppUser> setAvatar(
    Uint8List photo, {
    void Function(double progress)? onProgress,
  }) async {
    final key = await _uploads.upload(
      UploadPurpose.avatar,
      photo,
      onProgress: onProgress,
    );
    return _user('PUT', '/me/avatar', {'key': key});
  }

  Future<AppUser> removeAvatar() => _user('DELETE', '/me/avatar', null);

  Future<AppUser> _user(
    String method,
    String path,
    Map<String, dynamic>? body,
  ) async {
    try {
      final res = await _dio.request<Map<String, dynamic>>(
        path,
        data: body,
        options: Options(method: method),
      );
      return AppUser.fromJson(res.data!['user'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final profileRepositoryProvider = Provider<ProfileRepository>(
  (ref) => ProfileRepository(
    dio: ref.watch(dioProvider),
    uploads: ref.watch(uploadClientProvider),
  ),
);
