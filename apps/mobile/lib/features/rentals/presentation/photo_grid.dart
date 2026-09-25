import 'dart:typed_data';

import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/media/photo_picker.dart';
import '../../../core/theme/tokens.g.dart';

/// Photos picked on the phone before they're sent: a grid with an add tile.
/// Condition photos are best taken now, so the camera comes first.
class PhotoGrid extends ConsumerWidget {
  const PhotoGrid({
    required this.photos,
    required this.onChanged,
    this.max = 6,
    super.key,
  });

  final List<Uint8List> photos;
  final ValueChanged<List<Uint8List>> onChanged;
  final int max;

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final choice = await choosePhotoSource(context);
    if (choice == null) return;
    final picker = ref.read(photoPickerProvider);
    final room = max - photos.length;
    final picked = choice.source == PhotoSource.camera
        ? [?await picker.pick(PhotoSource.camera)]
        : await picker.pickMany(limit: room);
    if (picked.isEmpty) return;
    onChanged([...photos, ...picked.take(room)]);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: SajhaSpacing.sm,
      crossAxisSpacing: SajhaSpacing.sm,
      children: [
        for (final (i, bytes) in photos.indexed)
          Stack(
            fit: StackFit.expand,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(SajhaRadius.md),
                child: Image.memory(
                  bytes,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) =>
                      const ColoredBox(color: SajhaColors.brand100),
                ),
              ),
              Positioned(
                top: 2,
                right: 2,
                child: IconButton.filledTonal(
                  key: ValueKey('photo-remove-$i'),
                  visualDensity: VisualDensity.compact,
                  tooltip: 'Remove',
                  icon: const Icon(LucideIcons.x, size: 16),
                  onPressed: () => onChanged([...photos]..removeAt(i)),
                ),
              ),
            ],
          ),
        if (photos.length < max)
          OutlinedButton(
            key: const ValueKey('photo-add'),
            style: OutlinedButton.styleFrom(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(SajhaRadius.md),
              ),
            ),
            onPressed: () => _add(context, ref),
            child: const Column(
              mainAxisSize: MainAxisSize.min,
              children: [Icon(LucideIcons.imagePlus), Text('Add')],
            ),
          ),
      ],
    );
  }
}
