import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../data/documents_repository.dart';
import '../data/models.dart';

class DocumentViewArgs {
  const DocumentViewArgs({
    required this.documentId,
    required this.title,
    required this.side,
  });

  final String documentId;
  final String title;
  final DocumentSide side;
}

/// Shows one side of your own document through a short-lived link.
class DocumentViewerScreen extends ConsumerStatefulWidget {
  const DocumentViewerScreen({required this.args, super.key});

  final DocumentViewArgs args;

  @override
  ConsumerState<DocumentViewerScreen> createState() =>
      _DocumentViewerScreenState();
}

class _DocumentViewerScreenState extends ConsumerState<DocumentViewerScreen> {
  late Future<String> _url = _load();

  Future<String> _load() => ref
      .read(documentsRepositoryProvider)
      .viewUrl(widget.args.documentId, widget.args.side);

  @override
  Widget build(BuildContext context) {
    final side = widget.args.side == DocumentSide.back ? 'back' : 'front';
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('${widget.args.title} · $side'),
      ),
      body: FutureBuilder<String>(
        future: _url,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            final error = snapshot.error;
            return _Message(
              error is ApiException
                  ? error.friendlyMessage
                  : 'Couldn’t open the document.',
              onRetry: () => setState(() => _url = _load()),
            );
          }
          final url = snapshot.data;
          if (url == null) {
            return const Center(child: CircularProgressIndicator());
          }
          return InteractiveViewer(
            maxScale: 5,
            child: Center(
              child: Image.network(
                url,
                key: const ValueKey('document-image'),
                fit: BoxFit.contain,
                semanticLabel: '${widget.args.title}, $side side',
                errorBuilder: (_, _, _) => _Message(
                  'Couldn’t load the image.',
                  onRetry: () => setState(() => _url = _load()),
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text, {required this.onRetry});

  final String text;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            text,
            style: const TextStyle(color: Colors.white),
            textAlign: TextAlign.center,
          ),
          TextButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    ),
  );
}
