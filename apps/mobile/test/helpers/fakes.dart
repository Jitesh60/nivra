import 'package:sajha/core/device/device_info.dart';
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
