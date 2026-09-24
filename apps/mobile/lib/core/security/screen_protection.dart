import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Keeps someone else's document off screenshots and recordings while it's
/// on screen. Android: `FLAG_SECURE` (screenshots and recordings show black).
/// iOS can't block screenshots; [captured] turns true while the screen is
/// being recorded or mirrored, and the viewer blurs the document.
/// Faked in tests.
abstract interface class ScreenProtection {
  Future<void> protect();
  Future<void> release();

  /// The screen is being recorded or mirrored (iOS).
  ValueListenable<bool> get captured;
}

/// Talks to `MainActivity.kt` / `AppDelegate.swift` over `sajha/secure`.
class ChannelScreenProtection implements ScreenProtection {
  ChannelScreenProtection([MethodChannel? channel])
    : _channel = channel ?? const MethodChannel('sajha/secure') {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'captureChanged') {
        _captured.value = call.arguments == true;
      }
    });
  }

  final MethodChannel _channel;
  final _captured = ValueNotifier(false);

  @override
  ValueListenable<bool> get captured => _captured;

  @override
  Future<void> protect() async {
    await _invoke('setSecure', true);
    _captured.value = await _invoke<bool>('isCaptured') ?? false;
  }

  @override
  Future<void> release() => _invoke('setSecure', false);

  Future<T?> _invoke<T>(String method, [Object? args]) async {
    try {
      return await _channel.invokeMethod<T>(method, args);
    } on MissingPluginException {
      return null; // Platforms without the channel (desktop, tests).
    } on PlatformException {
      return null;
    }
  }
}

final screenProtectionProvider = Provider<ScreenProtection>(
  (ref) => ChannelScreenProtection(),
);
