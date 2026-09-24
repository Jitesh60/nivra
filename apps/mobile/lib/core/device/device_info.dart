import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What the user sees in "Your devices", e.g. "Samsung SM-A546E".
class DeviceDescription {
  const DeviceDescription({required this.name, required this.platform});

  final String name;

  /// `android` or `ios`.
  final String platform;
}

abstract class DeviceInfoService {
  Future<DeviceDescription> describe();
}

class PluginDeviceInfoService implements DeviceInfoService {
  final _plugin = DeviceInfoPlugin();

  @override
  Future<DeviceDescription> describe() async {
    try {
      if (Platform.isAndroid) {
        final info = await _plugin.androidInfo;
        final brand = info.brand.isEmpty
            ? ''
            : '${info.brand[0].toUpperCase()}${info.brand.substring(1)} ';
        return DeviceDescription(
          name: '$brand${info.model}',
          platform: 'android',
        );
      }
      if (Platform.isIOS) {
        final info = await _plugin.iosInfo;
        return DeviceDescription(name: info.utsname.machine, platform: 'ios');
      }
    } catch (_) {
      // Fall through to a generic description.
    }
    return DeviceDescription(
      name: 'Phone',
      platform: Platform.isIOS ? 'ios' : 'android',
    );
  }
}

final deviceInfoProvider = Provider<DeviceInfoService>(
  (ref) => PluginDeviceInfoService(),
);
