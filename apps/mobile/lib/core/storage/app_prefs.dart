import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Non-sensitive app preferences.
abstract class AppPrefs {
  Future<bool> onboardingSeen();
  Future<void> setOnboardingSeen();
}

class SharedAppPrefs implements AppPrefs {
  final _prefs = SharedPreferencesAsync();
  static const _onboardingKey = 'onboarding_seen';

  @override
  Future<bool> onboardingSeen() async =>
      await _prefs.getBool(_onboardingKey) ?? false;

  @override
  Future<void> setOnboardingSeen() => _prefs.setBool(_onboardingKey, true);
}

final appPrefsProvider = Provider<AppPrefs>((ref) => SharedAppPrefs());
