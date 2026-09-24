import 'dart:async';
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/security/screen_protection.dart';
import '../../../core/theme/tokens.g.dart';
import '../data/bookings_repository.dart';
import '../data/models.dart';

class SharedDocumentArgs {
  const SharedDocumentArgs({
    required this.bookingId,
    required this.shareId,
    required this.title,
    required this.hasBack,
  });

  final String bookingId;
  final String shareId;
  final String title;
  final bool hasBack;
}

/// The lender looks at a document the borrower shared: a short-lived link,
/// a watermark with their name and the time, and no screenshots (Android) or
/// a blur while the screen is recorded (iOS). Every opening is logged and
/// shown to the borrower.
class SharedDocumentScreen extends ConsumerStatefulWidget {
  const SharedDocumentScreen({required this.args, super.key});

  final SharedDocumentArgs args;

  @override
  ConsumerState<SharedDocumentScreen> createState() =>
      _SharedDocumentScreenState();
}

class _SharedDocumentScreenState extends ConsumerState<SharedDocumentScreen> {
  late final ScreenProtection _protection = ref.read(screenProtectionProvider);
  bool _back = false;
  late Future<DocumentLink> _link = _load();

  @override
  void initState() {
    super.initState();
    unawaited(_protection.protect());
  }

  @override
  void dispose() {
    unawaited(_protection.release());
    super.dispose();
  }

  Future<DocumentLink> _load() => ref
      .read(bookingsRepositoryProvider)
      .documentLink(widget.args.bookingId, widget.args.shareId, back: _back);

  void _side(bool back) {
    if (back == _back) return;
    setState(() {
      _back = back;
      _link = _load();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.args.title),
        bottom: widget.args.hasBack
            ? PreferredSize(
                preferredSize: const Size.fromHeight(48),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: SajhaSpacing.sm),
                  child: SegmentedButton<bool>(
                    key: const ValueKey('document-side'),
                    style: SegmentedButton.styleFrom(
                      foregroundColor: Colors.white,
                      selectedForegroundColor: Colors.black,
                      selectedBackgroundColor: Colors.white,
                    ),
                    segments: const [
                      ButtonSegment(value: false, label: Text('Front')),
                      ButtonSegment(value: true, label: Text('Back')),
                    ],
                    selected: {_back},
                    onSelectionChanged: (s) => _side(s.first),
                  ),
                ),
              )
            : null,
      ),
      body: FutureBuilder<DocumentLink>(
        future: _link,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            final error = snapshot.error;
            return _Message(
              error is ApiException
                  ? error.friendlyMessage
                  : 'Couldn’t open the document.',
            );
          }
          final link = snapshot.data;
          if (link == null) {
            return const Center(child: CircularProgressIndicator());
          }
          return ValueListenableBuilder<bool>(
            valueListenable: _protection.captured,
            builder: (context, captured, _) => Stack(
              fit: StackFit.expand,
              children: [
                InteractiveViewer(
                  child: Center(
                    child: Image.network(
                      link.url,
                      key: const ValueKey('shared-document-image'),
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) =>
                          const _Message('Couldn’t load the image.'),
                    ),
                  ),
                ),
                IgnorePointer(child: _Watermark(link.watermark)),
                if (captured)
                  Positioned.fill(
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 30, sigmaY: 30),
                      child: const ColoredBox(
                        color: Colors.black54,
                        child: _Message(
                          'Screen recording is on, so the document is hidden.',
                          key: ValueKey('document-hidden'),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// The viewer's name and the time, repeated diagonally across the document.
class _Watermark extends StatelessWidget {
  const _Watermark(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: Transform.rotate(
        angle: -0.5,
        child: OverflowBox(
          maxWidth: double.infinity,
          maxHeight: double.infinity,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 14; i++)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 28),
                  child: Text(
                    text,
                    key: i == 0 ? const ValueKey('document-watermark') : null,
                    maxLines: 1,
                    softWrap: false,
                    style: const TextStyle(
                      color: Color(0x55FFFFFF),
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(SajhaSpacing.xl),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white),
      ),
    ),
  );
}
