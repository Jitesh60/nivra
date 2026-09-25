import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';

/// One switch on the Notifications screen, as the API names it.
enum NotificationSwitch {
  pushBookings,
  pushChat,
  pushReminders,
  emailBookings,
  smsReminders,
  marketing,
  pushSearchAlerts,
  pushRequests,
}

/// What the user wants to hear about by push, email and SMS. In-app
/// notifications (the bell) and sign-in codes always arrive.
class NotificationPreferences {
  const NotificationPreferences(this.values);

  final Map<NotificationSwitch, bool> values;

  factory NotificationPreferences.fromJson(Map<String, dynamic> json) =>
      NotificationPreferences({
        for (final s in NotificationSwitch.values)
          s: json[s.name] as bool? ?? s != NotificationSwitch.marketing,
      });

  bool operator [](NotificationSwitch s) => values[s] ?? false;

  NotificationPreferences withValue(NotificationSwitch s, bool on) =>
      NotificationPreferences({...values, s: on});
}

class NotificationPreferencesRepository {
  NotificationPreferencesRepository(this._dio);

  final Dio _dio;

  Future<NotificationPreferences> get() =>
      _call(() => _dio.get('/me/notification-preferences'));

  /// Changes one switch; the rest stay as they are.
  Future<NotificationPreferences> set(NotificationSwitch s, bool on) =>
      _call(() => _dio.put('/me/notification-preferences', data: {s.name: on}));

  Future<NotificationPreferences> _call(
    Future<Response<dynamic>> Function() request,
  ) async {
    try {
      final res = await request();
      return NotificationPreferences.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final notificationPreferencesRepositoryProvider =
    Provider<NotificationPreferencesRepository>(
      (ref) => NotificationPreferencesRepository(ref.watch(dioProvider)),
    );
