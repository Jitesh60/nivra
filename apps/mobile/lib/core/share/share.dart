import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:share_plus/share_plus.dart';

/// Opens the system share sheet with [text]. A seam so tests can record it.
typedef TextSharer = Future<void> Function(String text, {String? subject});

final textSharerProvider = Provider<TextSharer>(
  (ref) =>
      (text, {subject}) =>
          SharePlus.instance.share(ShareParams(text: text, subject: subject)),
);
