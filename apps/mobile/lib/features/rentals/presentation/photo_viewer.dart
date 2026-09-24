import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../bookings/data/models.dart';

class PhotoViewerArgs {
  const PhotoViewerArgs(this.photos, this.initial, this.title);
  final List<ConditionPhoto> photos;
  final int initial;
  final String title;
}

/// Full-screen photos, swipe between them, pinch to zoom.
class PhotoViewerScreen extends StatefulWidget {
  const PhotoViewerScreen({required this.args, super.key});

  final PhotoViewerArgs args;

  @override
  State<PhotoViewerScreen> createState() => _PhotoViewerScreenState();
}

class _PhotoViewerScreenState extends State<PhotoViewerScreen> {
  late final _pages = PageController(initialPage: widget.args.initial);
  late int _index = widget.args.initial;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photos = widget.args.photos;
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('${widget.args.title} · ${_index + 1}/${photos.length}'),
      ),
      body: PageView.builder(
        controller: _pages,
        itemCount: photos.length,
        onPageChanged: (i) => setState(() => _index = i),
        itemBuilder: (_, i) => InteractiveViewer(
          child: Image.network(
            photos[i].url,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => const Center(
              child: Text(
                'Couldn’t load this photo.',
                style: TextStyle(color: Colors.white),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A row of thumbnails that open the viewer.
class PhotoStrip extends StatelessWidget {
  const PhotoStrip({
    required this.photos,
    required this.title,
    this.keyPrefix = 'photo',
    super.key,
  });

  final List<ConditionPhoto> photos;
  final String title;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 72,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: photos.length,
        separatorBuilder: (_, _) => const SizedBox(width: SajhaSpacing.xs),
        itemBuilder: (context, i) => InkWell(
          key: ValueKey('$keyPrefix-$i'),
          onTap: () => context.push(
            Routes.photos,
            extra: PhotoViewerArgs(photos, i, title),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(SajhaRadius.sm),
            child: SizedBox.square(
              dimension: 72,
              child: Image.network(
                photos[i].thumbUrl,
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) =>
                    const ColoredBox(color: SajhaColors.brand100),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
