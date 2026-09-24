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
  });
}
