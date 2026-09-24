import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import '../config/app_config.dart';
import 'push_service.dart';

/// Firebase Cloud Messaging. Firebase is initialised from the build's
/// settings (no google-services files needed), only when they're present.
class FirebasePushService implements PushService {
  FirebasePushService._();

  /// Null when the platform or config can't do push.
  static Future<FirebasePushService?> start(FirebaseConfig config) async {
    if (!(Platform.isAndroid || Platform.isIOS)) return null;
    try {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: config.apiKey,
          appId: config.appId,
          messagingSenderId: config.messagingSenderId,
          projectId: config.projectId,
        ),
      );
      return FirebasePushService._();
    } catch (_) {
      return null; // Bad settings shouldn't stop the app.
    }
  }

  FirebaseMessaging get _fcm => FirebaseMessaging.instance;

  @override
  Future<String?> register() async {
    final settings = await _fcm.requestPermission();
    if (settings.authorizationStatus == AuthorizationStatus.denied) return null;
    return _fcm.getToken();
  }

  @override
  Stream<String> get tokenRefreshes => _fcm.onTokenRefresh;

  @override
  Stream<PushOpen> get opened async* {
    final initial = await _fcm.getInitialMessage();
    if (initial != null) yield PushOpen.fromData(initial.data);
    yield* FirebaseMessaging.onMessageOpenedApp.map(
      (m) => PushOpen.fromData(m.data),
    );
  }
}
