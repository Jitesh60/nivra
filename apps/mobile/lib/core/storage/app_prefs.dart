import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Non-sensitive app preferences.
abstract class AppPrefs {
  Future<bool> onboardingSeen();
  Future<void> setOnboardingSeen();

  /// The borrower's search area, as JSON (see `SearchArea`).
  Future<String?> searchArea();
  Future<void> setSearchArea(String json);

  /// Listing ids the user opened, most recent first.
  Future<List<String>> recentlyViewed();
  Future<void> setRecentlyViewed(List<String> ids);
}

class SharedAppPrefs implements AppPrefs {
  final _prefs = SharedPreferencesAsync();
  static const _onboardingKey = 'onboarding_seen';
  static const _areaKey = 'search_area';
  static const _recentKey = 'recently_viewed';

  @override
  Future<bool> onboardingSeen() async =>
      await _prefs.getBool(_onboardingKey) ?? false;

  @override
  Future<void> setOnboardingSeen() => _prefs.setBool(_onboardingKey, true);

  @override
  Future<String?> searchArea() => _prefs.getString(_areaKey);

  @override
  Future<void> setSearchArea(String json) => _prefs.setString(_areaKey, json);

  @override
  Future<List<String>> recentlyViewed() async =>
      await _prefs.getStringList(_recentKey) ?? const [];

  @override
  Future<void> setRecentlyViewed(List<String> ids) =>
      _prefs.setStringList(_recentKey, ids);
}

final appPrefsProvider = Provider<AppPrefs>((ref) => SharedAppPrefs());
