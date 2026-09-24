import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';

/// Why the current position isn't available.
enum LocationProblem { serviceOff, denied, deniedForever, unavailable }

class LocationResult {
  const LocationResult.found(LatLng this.position) : problem = null;
  const LocationResult.failed(LocationProblem this.problem) : position = null;

  final LatLng? position;
  final LocationProblem? problem;
}

/// Current position, asking for permission when needed. Faked in tests.
abstract interface class LocationService {
  Future<LocationResult> current();
}

class DeviceLocationService implements LocationService {
  @override
  Future<LocationResult> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const LocationResult.failed(LocationProblem.serviceOff);
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    switch (permission) {
      case LocationPermission.denied:
        return const LocationResult.failed(LocationProblem.denied);
      case LocationPermission.deniedForever:
        return const LocationResult.failed(LocationProblem.deniedForever);
      default:
        try {
          final p = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.high,
              timeLimit: Duration(seconds: 15),
            ),
          );
          return LocationResult.found(LatLng(p.latitude, p.longitude));
        } catch (_) {
          return const LocationResult.failed(LocationProblem.unavailable);
        }
    }
  }
}

final locationServiceProvider = Provider<LocationService>(
  (ref) => DeviceLocationService(),
);
