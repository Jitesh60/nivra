import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:latlong2/latlong.dart';
import 'package:sajha/core/device/device_info.dart';
import 'package:sajha/core/location/location_service.dart';
import 'package:sajha/core/media/photo_picker.dart';
import 'package:sajha/core/push/push_service.dart';
import 'package:sajha/core/realtime/realtime_client.dart';
import 'package:sajha/core/storage/app_prefs.dart';
import 'package:sajha/core/storage/session_storage.dart';

import 'fake_api.dart';

class InMemorySessionStorage implements SessionStorage {
  InMemorySessionStorage({this.refreshToken});

  String? refreshToken;
  final String _deviceId = 'test-device-0001';

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> writeRefreshToken(String token) async => refreshToken = token;

  @override
  Future<void> clearRefreshToken() async => refreshToken = null;

  @override
  Future<String> deviceId() async => _deviceId;
}

class FakeAppPrefs implements AppPrefs {
  FakeAppPrefs({this.seen = false});

  bool seen;

  @override
  Future<bool> onboardingSeen() async => seen;

  @override
  Future<void> setOnboardingSeen() async => seen = true;

  String? area;
  List<String> recent = [];

  @override
  Future<String?> searchArea() async => area;

  @override
  Future<void> setSearchArea(String json) async => area = json;

  @override
  Future<List<String>> recentlyViewed() async => recent;

  @override
  Future<void> setRecentlyViewed(List<String> ids) async => recent = ids;
}

class FakeDeviceInfo implements DeviceInfoService {
  @override
  Future<DeviceDescription> describe() async =>
      const DeviceDescription(name: 'Pixel 8', platform: 'android');
}

/// A minimal JPEG header followed by filler: enough for magic-byte checks.
Uint8List fakeJpeg([int size = 2048]) =>
    Uint8List(size)..setAll(0, [0xFF, 0xD8, 0xFF, 0xE0]);

class FakePhotoPicker implements PhotoPicker {
  /// What the next pick returns; null means the user cancelled.
  Uint8List? next = fakeJpeg();
  final calls = <({PhotoSource source, bool squareCrop})>[];

  @override
  Future<Uint8List?> pick(PhotoSource source, {bool squareCrop = false}) async {
    calls.add((source: source, squareCrop: squareCrop));
    return next;
  }

  /// What the next multi-pick returns.
  List<Uint8List> nextMany = [fakeJpeg(), fakeJpeg(3000)];
  int manyCalls = 0;

  @override
  Future<List<Uint8List>> pickMany({required int limit}) async {
    manyCalls++;
    return nextMany.take(limit).toList();
  }
}

class FakeLocationService implements LocationService {
  /// What the next lookup returns.
  LocationResult next = const LocationResult.found(LatLng(18.5074, 73.8077));
  int calls = 0;

  @override
  Future<LocationResult> current() async {
    calls++;
    return next;
  }
}

/// Live events from [FakeSajhaApi], delivered while "connected" to whoever
/// the app is signed in as.
class FakeRealtime implements RealtimeClient {
  FakeRealtime(this.api) {
    api.onRealtime = (userId, event, data) {
      if (_connected.value && userId == api.appUserId) {
        _events.add(RealtimeEvent(event, data));
      }
    };
  }

  final FakeSajhaApi api;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final _connected = ValueNotifier(false);
  final typed = <String>[];
  int connects = 0;

  @override
  Stream<RealtimeEvent> get events => _events.stream;

  @override
  ValueListenable<bool> get connected => _connected;

  @override
  void connect() {
    connects++;
    _connected.value = true;
  }

  @override
  void disconnect() => _connected.value = false;

  @override
  void typing(String conversationId) => typed.add(conversationId);
}

class FakePushService implements PushService {
  String? token = 'fcm-test-token';
  int registrations = 0;
  final openedController = StreamController<PushOpen>.broadcast();

  @override
  Future<String?> register() async {
    registrations++;
    return token;
  }

  @override
  Stream<String> get tokenRefreshes => const Stream.empty();

  @override
  Stream<PushOpen> get opened => openedController.stream;
}
