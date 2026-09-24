import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/network/upload_client.dart';
import '../../listings/data/models.dart' show isoDate;
import 'models.dart';

/// Conversations, messages, offers, blocks, reports and push tokens.
/// Throws [ApiException].
class ChatRepository {
  ChatRepository({required this._dio, required this._uploads});

  final Dio _dio;
  final UploadClient _uploads;

  /// Opens (or returns) the chat about a listing.
  Future<Conversation> start(String listingId) async => Conversation.fromJson(
    await _call(
      () => _dio.post<Map<String, dynamic>>(
        '/conversations',
        data: {'listingId': listingId},
      ),
    ),
  );

  Future<Page<Conversation>> inbox({String? cursor}) async {
    final json = await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/conversations',
        queryParameters: {'cursor': ?cursor},
      ),
    );
    return Page([
      for (final c in json['items'] as List)
        Conversation.fromJson(c as Map<String, dynamic>),
    ], json['nextCursor'] as String?);
  }

  Future<Conversation> conversation(String id) async => Conversation.fromJson(
    await _call(() => _dio.get<Map<String, dynamic>>('/conversations/$id')),
  );

  /// Unread conversations, for the inbox badge.
  Future<int> unreadConversations() async {
    final json = await _call(
      () => _dio.get<Map<String, dynamic>>('/me/unread'),
    );
    return (json['conversations'] as num).toInt();
  }

  /// Newest first; pass the last page's cursor as [before] for older ones.
  Future<Page<ChatMessage>> messages(
    String conversationId, {
    String? before,
  }) async {
    final json = await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        queryParameters: {'before': ?before},
      ),
    );
    return Page([
      for (final m in json['items'] as List)
        ChatMessage.fromJson(m as Map<String, dynamic>),
    ], json['nextCursor'] as String?);
  }

  Future<ChatMessage> sendText(
    String conversationId,
    String body,
    String clientId,
  ) => _message(
    () => _dio.post<Map<String, dynamic>>(
      '/conversations/$conversationId/messages',
      data: {'type': 'TEXT', 'body': body, 'clientId': clientId},
    ),
  );

  Future<ChatMessage> sendPhoto(
    String conversationId,
    Uint8List photo,
    String clientId,
  ) async {
    final key = await _uploads.upload(UploadPurpose.chatImage, photo);
    return _message(
      () => _dio.post<Map<String, dynamic>>(
        '/conversations/$conversationId/messages',
        data: {'type': 'IMAGE', 'key': key, 'clientId': clientId},
      ),
    );
  }

  Future<void> markRead(String conversationId, String upTo) => _call(
    () => _dio.post<void>(
      '/conversations/$conversationId/read',
      data: {'upTo': upTo},
    ),
  );

  Future<ChatMessage> makeOffer(
    String conversationId, {
    required DateTime start,
    required DateTime end,
    required int pricePerDayPaise,
  }) => _message(
    () => _dio.post<Map<String, dynamic>>(
      '/conversations/$conversationId/offers',
      data: _offer(start, end, pricePerDayPaise),
    ),
  );

  Future<ChatMessage> counter(
    String offerId, {
    required DateTime start,
    required DateTime end,
    required int pricePerDayPaise,
  }) => _message(
    () => _dio.post<Map<String, dynamic>>(
      '/offers/$offerId/counter',
      data: _offer(start, end, pricePerDayPaise),
    ),
  );

  Future<Offer> accept(String offerId) async => Offer.fromJson(
    await _call(
      () => _dio.post<Map<String, dynamic>>('/offers/$offerId/accept'),
    ),
  );

  Future<Offer> decline(String offerId) async => Offer.fromJson(
    await _call(
      () => _dio.post<Map<String, dynamic>>('/offers/$offerId/decline'),
    ),
  );

  Future<void> block(String userId) =>
      _call(() => _dio.put<void>('/me/blocks/$userId'));

  Future<void> unblock(String userId) =>
      _call(() => _dio.delete<void>('/me/blocks/$userId'));

  Future<void> report({
    required ReportTarget target,
    required String targetId,
    required ReportReason reason,
    String? note,
    String? conversationId,
  }) => _call(
    () => _dio.post<void>(
      '/reports',
      data: {
        'targetType': target.apiValue,
        'targetId': targetId,
        'reason': reason.apiValue,
        if (note != null && note.trim().isNotEmpty) 'note': note.trim(),
        'conversationId': ?conversationId,
      },
    ),
  );

  Future<void> registerPushToken(String token, String platform) => _call(
    () => _dio.put<void>(
      '/me/devices/push-token',
      data: {'token': token, 'platform': platform},
    ),
  );

  Map<String, dynamic> _offer(DateTime start, DateTime end, int price) => {
    'startDate': isoDate(start),
    'endDate': isoDate(end),
    'pricePerDayPaise': price,
  };

  Future<ChatMessage> _message(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async => ChatMessage.fromJson(await _call(request));

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ChatRepository(
    dio: ref.watch(dioProvider),
    uploads: ref.watch(uploadClientProvider),
  ),
);
