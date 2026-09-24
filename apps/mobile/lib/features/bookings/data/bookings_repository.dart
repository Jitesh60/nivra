import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../chat/data/models.dart' show Page;
import '../../listings/data/models.dart' show isoDate;
import 'models.dart';

/// Bookings, shared documents and in-app notifications. Throws [ApiException].
class BookingsRepository {
  BookingsRepository({required this._dio});

  final Dio _dio;

  /// "Request to book" at the listed price.
  Future<BookingDetail> request({
    required String listingId,
    required DateTime start,
    required DateTime end,
  }) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/bookings',
      data: {
        'listingId': listingId,
        'startDate': isoDate(start),
        'endDate': isoDate(end),
      },
    ),
  );

  Future<Page<Booking>> list(
    BookingRole role,
    BookingScope scope, {
    String? cursor,
  }) async {
    final json = await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/bookings',
        queryParameters: {
          'role': role == BookingRole.borrower ? 'BORROWER' : 'LENDER',
          'scope': scope == BookingScope.open ? 'OPEN' : 'PAST',
          'cursor': ?cursor,
        },
      ),
    );
    return Page([
      for (final b in json['items'] as List)
        Booking.fromJson(b as Map<String, dynamic>),
    ], json['nextCursor'] as String?);
  }

  Future<BookingDetail> get(String id) =>
      _detail(() => _dio.get<Map<String, dynamic>>('/bookings/$id'));

  Future<BookingDetail> accept(String id) =>
      _detail(() => _dio.post<Map<String, dynamic>>('/bookings/$id/accept'));

  Future<BookingDetail> decline(String id, {String? reason}) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/bookings/$id/decline',
      data: {
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      },
    ),
  );

  Future<BookingDetail> cancel(String id, String reason) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/bookings/$id/cancel',
      data: {'reason': reason.trim()},
    ),
  );

  /// Shares one vault document per required document ([choices]: required
  /// document id → vault document id).
  Future<BookingDetail> shareDocuments(
    String id,
    Map<String, String> choices,
  ) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/bookings/$id/documents',
      data: {
        'shares': [
          for (final e in choices.entries)
            {'requiredDocId': e.key, 'userDocumentId': e.value},
        ],
      },
    ),
  );

  Future<BookingDetail> approveDocuments(String id) => _detail(
    () => _dio.post<Map<String, dynamic>>('/bookings/$id/documents/approve'),
  );

  Future<BookingDetail> rejectDocuments(String id, String reason) => _detail(
    () => _dio.post<Map<String, dynamic>>(
      '/bookings/$id/documents/reject',
      data: {'reason': reason.trim()},
    ),
  );

  /// Lender: a 5-minute link to a shared document (the view is logged).
  Future<DocumentLink> documentLink(
    String bookingId,
    String shareId, {
    bool back = false,
  }) async => DocumentLink.fromJson(
    await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/bookings/$bookingId/documents/$shareId/view',
        queryParameters: {'side': back ? 'back' : 'front'},
      ),
    ),
  );

  // ── Notifications ──

  Future<NotificationPage> notifications({String? cursor}) async {
    final json = await _call(
      () => _dio.get<Map<String, dynamic>>(
        '/me/notifications',
        queryParameters: {'cursor': ?cursor},
      ),
    );
    return NotificationPage(
      [
        for (final n in json['items'] as List)
          AppNotification.fromJson(n as Map<String, dynamic>),
      ],
      json['nextCursor'] as String?,
      (json['unread'] as num).toInt(),
    );
  }

  /// Marks everything up to [upTo] read, or everything.
  Future<void> markNotificationsRead({String? upTo}) => _call(
    () => _dio.post<void>('/me/notifications/read', data: {'upTo': ?upTo}),
  );

  Future<int> unreadNotifications() async {
    final json = await _call(
      () => _dio.get<Map<String, dynamic>>('/me/unread'),
    );
    return (json['notifications'] as num?)?.toInt() ?? 0;
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

final bookingsRepositoryProvider = Provider<BookingsRepository>(
  (ref) => BookingsRepository(dio: ref.watch(dioProvider)),
);
