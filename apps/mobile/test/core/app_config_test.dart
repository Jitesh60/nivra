import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/config/app_config.dart';

void main() {
  group('AppConfig.parse', () {
    test('accepts a known env and absolute URL', () {
      final config = AppConfig.parse(
        env: 'staging',
        apiBaseUrl: 'https://api.staging.sajha.app',
      );
      expect(config.env, AppEnv.staging);
      expect(config.isProd, isFalse);
    });

    test('rejects an unknown env', () {
      expect(
        () => AppConfig.parse(env: 'qa', apiBaseUrl: 'http://x.test'),
        throwsArgumentError,
      );
    });

    test('rejects a relative API URL', () {
      expect(
        () => AppConfig.parse(env: 'dev', apiBaseUrl: '/v1'),
        throwsArgumentError,
      );
    });

    test('defaults map tiles to OpenStreetMap; a custom template must be a tile URL', () {
      expect(
        AppConfig.parse(env: 'dev', apiBaseUrl: 'http://x.test').mapTileUrl,
        AppConfig.osmTileUrl,
      );
      expect(
        AppConfig.parse(
          env: 'prod',
          apiBaseUrl: 'https://api.sajha.app',
          mapTileUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
        ).mapTileUrl,
        'https://tiles.example.com/{z}/{x}/{y}.png',
      );
      expect(
        () => AppConfig.parse(
          env: 'dev',
          apiBaseUrl: 'http://x.test',
          mapTileUrl: 'tiles.example.com',
        ),
        throwsArgumentError,
      );
    });
  });
}
