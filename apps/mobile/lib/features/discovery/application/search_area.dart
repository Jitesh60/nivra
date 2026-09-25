import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/location/location_service.dart';
import '../../../core/storage/app_prefs.dart';

/// Where the borrower is looking, and how far out.
class SearchArea {
  const SearchArea({
    required this.lat,
    required this.lng,
    required this.label,
    this.radiusKm = defaultRadiusKm,
  });

  factory SearchArea.fromJson(Map<String, dynamic> json) => SearchArea(
    lat: (json['lat'] as num).toDouble(),
    lng: (json['lng'] as num).toDouble(),
    label: json['label'] as String,
    radiusKm: (json['radiusKm'] as num).toInt().clamp(minRadiusKm, maxRadiusKm),
  );

  static const defaultRadiusKm = 5;
  static const minRadiusKm = 1;
  static const maxRadiusKm = 25;

  final double lat;
  final double lng;

  /// "Current location" or "Area on map": no reverse geocoding yet.
  final String label;
  final int radiusKm;

  LatLng get point => LatLng(lat, lng);

  SearchArea withRadius(int km) => SearchArea(
    lat: lat,
    lng: lng,
    label: label,
    radiusKm: km.clamp(minRadiusKm, maxRadiusKm),
  );

  Map<String, dynamic> toJson() => {
    'lat': lat,
    'lng': lng,
    'label': label,
    'radiusKm': radiusKm,
  };

  Map<String, dynamic> toQuery() => {
    'lat': lat,
    'lng': lng,
    'radiusKm': radiusKm,
  };

  /// "Current location · 5 km".
  String get summary => '$label · $radiusKm km';
}

/// The saved search area; null until the borrower sets one.
class SearchAreaController extends AsyncNotifier<SearchArea?> {
  static const gpsLabel = 'Current location';
  static const mapLabel = 'Area on map';

  AppPrefs get _prefs => ref.read(appPrefsProvider);

  @override
  Future<SearchArea?> build() async {
    final raw = await _prefs.searchArea();
    if (raw == null) return null;
    try {
      return SearchArea.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } on Object {
      return null; // Unreadable (older format): ask again.
    }
  }

  int get _radius => state.value?.radiusKm ?? SearchArea.defaultRadiusKm;

  /// Sets the area from the device's position. Returns the problem, if any.
  Future<LocationProblem?> useCurrentLocation() async {
    final result = await ref.read(locationServiceProvider).current();
    final p = result.position;
    if (p == null) return result.problem;
    await _set(
      SearchArea(
        lat: p.latitude,
        lng: p.longitude,
        label: gpsLabel,
        radiusKm: _radius,
      ),
    );
    return null;
  }

  Future<void> usePoint(LatLng p) => _set(
    SearchArea(
      lat: p.latitude,
      lng: p.longitude,
      label: mapLabel,
      radiusKm: _radius,
    ),
  );

  Future<void> setRadius(int km) async {
    final area = state.value;
    if (area != null) await _set(area.withRadius(km));
  }

  Future<void> _set(SearchArea area) async {
    state = AsyncData(area);
    await _prefs.setSearchArea(jsonEncode(area.toJson()));
  }
}

final searchAreaProvider =
    AsyncNotifierProvider<SearchAreaController, SearchArea?>(
      SearchAreaController.new,
    );

/// Friendly text for why the position couldn't be read.
String locationProblemMessage(LocationProblem problem) => switch (problem) {
  LocationProblem.serviceOff =>
    'Turn on location services, or pick on the map.',
  LocationProblem.denied =>
    'Location permission is off. You can pick your area on the map.',
  LocationProblem.deniedForever =>
    'Location is blocked for Nivra in settings. Pick your area on the map.',
  LocationProblem.unavailable =>
    'Couldn’t find your location. Try again or pick on the map.',
};
