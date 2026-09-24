/// Build-time configuration, injected with
/// `--dart-define-from-file=config/<env>.json` (see config/).
enum AppEnv { dev, staging, prod }

/// Firebase project settings for push (from the Firebase console's app
/// config). Push stays off until all four are set.
class FirebaseConfig {
  const FirebaseConfig({
    required this.apiKey,
    required this.appId,
    required this.messagingSenderId,
    required this.projectId,
  });

  final String apiKey;
  final String appId;
  final String messagingSenderId;
  final String projectId;

  /// Null unless every value is present.
  static FirebaseConfig? maybe({
    required String apiKey,
    required String appId,
    required String messagingSenderId,
    required String projectId,
  }) => [apiKey, appId, messagingSenderId, projectId].any((v) => v.isEmpty)
      ? null
      : FirebaseConfig(
          apiKey: apiKey,
          appId: appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
        );
}

class AppConfig {
  const AppConfig({
    required this.env,
    required this.apiBaseUrl,
    this.mapTileUrl = osmTileUrl,
    this.firebase,
  });

  /// OpenStreetMap's public tiles: fine for development and light use. Point
  /// MAP_TILE_URL at a paid or self-hosted tile server before launch
  /// (https://operations.osmfoundation.org/policies/tiles/).
  static const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  /// Reads the values compiled into this build. Defaults target a local API
  /// from the Android emulator (10.0.2.2 is the host machine).
  factory AppConfig.fromEnvironment() => AppConfig.parse(
    env: const String.fromEnvironment('ENV', defaultValue: 'dev'),
    apiBaseUrl: const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:3000',
    ),
    mapTileUrl: const String.fromEnvironment(
      'MAP_TILE_URL',
      defaultValue: osmTileUrl,
    ),
    firebase: FirebaseConfig.maybe(
      apiKey: const String.fromEnvironment('FIREBASE_API_KEY'),
      appId: const String.fromEnvironment('FIREBASE_APP_ID'),
      messagingSenderId: const String.fromEnvironment(
        'FIREBASE_MESSAGING_SENDER_ID',
      ),
      projectId: const String.fromEnvironment('FIREBASE_PROJECT_ID'),
    ),
  );

  factory AppConfig.parse({
    required String env,
    required String apiBaseUrl,
    String mapTileUrl = osmTileUrl,
    FirebaseConfig? firebase,
  }) {
    final parsed = AppEnv.values.where((e) => e.name == env).firstOrNull;
    if (parsed == null) {
      throw ArgumentError.value(
        env,
        'ENV',
        'must be one of ${AppEnv.values.map((e) => e.name)}',
      );
    }
    final uri = Uri.tryParse(apiBaseUrl);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      throw ArgumentError.value(
        apiBaseUrl,
        'API_BASE_URL',
        'must be an absolute URL',
      );
    }
    if (!mapTileUrl.contains('{z}') || !mapTileUrl.startsWith('http')) {
      throw ArgumentError.value(
        mapTileUrl,
        'MAP_TILE_URL',
        'must be a tile URL template with {z}/{x}/{y}',
      );
    }
    return AppConfig(
      env: parsed,
      apiBaseUrl: apiBaseUrl,
      mapTileUrl: mapTileUrl,
      firebase: firebase,
    );
  }

  final AppEnv env;
  final String apiBaseUrl;

  /// Map tile URL template for the pickup-location map.
  final String mapTileUrl;

  /// Push notifications; null until Firebase is set up for this build.
  final FirebaseConfig? firebase;

  bool get isProd => env == AppEnv.prod;

  /// Socket.IO endpoint for live chat updates (same host as the API).
  String get socketUrl => '$apiBaseUrl/ws';
}
