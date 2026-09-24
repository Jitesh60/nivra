import 'dart:typed_data';

import 'package:latlong2/latlong.dart';
import 'package:sajha/core/device/device_info.dart';
import 'package:sajha/core/location/location_service.dart';
import 'package:sajha/core/media/photo_picker.dart';
import 'package:sajha/core/storage/app_prefs.dart';
import 'package:sajha/core/storage/session_storage.dart';

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
