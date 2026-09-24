import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

/// Pages on the website the app links to.
abstract final class SajhaLinks {
  static const website = 'https://sajha.app';
  static final privacy = Uri.parse('$website/privacy');
  static final terms = Uri.parse('$website/terms');
  static final help = Uri.parse('$website/contact');
  static final deleteAccount = Uri.parse('$website/delete-account');
}

/// Opens a link outside the app (the browser). A seam so tests can record it.
typedef LinkOpener = Future<bool> Function(Uri uri);

final linkOpenerProvider = Provider<LinkOpener>(
  (ref) =>
      (uri) => launchUrl(uri, mode: LaunchMode.externalApplication),
);

/// The version the build was made with (`flutter build --build-name/number`).
String appVersion() {
  const name = String.fromEnvironment('FLUTTER_BUILD_NAME');
  const number = String.fromEnvironment('FLUTTER_BUILD_NUMBER');
  if (name.isEmpty) return 'development build';
  return number.isEmpty ? name : '$name ($number)';
}
