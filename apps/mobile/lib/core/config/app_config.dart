/// Build-time configuration, injected with
/// `--dart-define-from-file=config/<env>.json` (see config/).
enum AppEnv { dev, staging, prod }

class AppConfig {
  const AppConfig({required this.env, required this.apiBaseUrl});

  /// Reads the values compiled into this build. Defaults target a local API
  /// from the Android emulator (10.0.2.2 is the host machine).
  factory AppConfig.fromEnvironment() => AppConfig.parse(
    env: const String.fromEnvironment('ENV', defaultValue: 'dev'),
    apiBaseUrl: const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:3000',
    ),
  );

  factory AppConfig.parse({required String env, required String apiBaseUrl}) {
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
    return AppConfig(env: parsed, apiBaseUrl: apiBaseUrl);
  }

  final AppEnv env;
  final String apiBaseUrl;

  bool get isProd => env == AppEnv.prod;
}
