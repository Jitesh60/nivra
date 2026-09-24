import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';

import '../theme/tokens.g.dart';

enum PhotoSource { camera, gallery }

/// Takes or chooses a photo. Swapped for a fake in widget tests.
abstract interface class PhotoPicker {
  /// Returns the image bytes, or null when the user cancels.
  /// [squareCrop] opens a 1:1 cropper (profile photos).
  Future<Uint8List?> pick(PhotoSource source, {bool squareCrop = false});
}

class DevicePhotoPicker implements PhotoPicker {
  final _picker = ImagePicker();

  @override
  Future<Uint8List?> pick(PhotoSource source, {bool squareCrop = false}) async {
    final file = await _picker.pickImage(
      source: source == PhotoSource.camera
          ? ImageSource.camera
          : ImageSource.gallery,
      // The API re-encodes anyway; this keeps uploads small on slow networks.
      maxWidth: 2400,
      maxHeight: 2400,
      imageQuality: 88,
      requestFullMetadata: false,
    );
    if (file == null) return null;
    if (!squareCrop) return file.readAsBytes();

    final cropped = await ImageCropper().cropImage(
      sourcePath: file.path,
      aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
      maxWidth: 1024,
      maxHeight: 1024,
      uiSettings: [
        AndroidUiSettings(
          toolbarTitle: 'Crop photo',
          toolbarColor: SajhaColors.brand600,
          toolbarWidgetColor: Colors.white,
          activeControlsWidgetColor: SajhaColors.brand600,
          lockAspectRatio: true,
        ),
        IOSUiSettings(title: 'Crop photo', aspectRatioLockEnabled: true),
      ],
    );
    return cropped?.readAsBytes();
  }
}

final photoPickerProvider = Provider<PhotoPicker>((ref) => DevicePhotoPicker());

/// Bottom sheet: "Take photo" / "Choose from gallery" (and optionally
/// "Remove photo"). Returns the choice, or null when dismissed.
Future<PhotoSourceChoice?> choosePhotoSource(
  BuildContext context, {
  bool allowRemove = false,
}) => showModalBottomSheet<PhotoSourceChoice>(
  context: context,
  showDragHandle: true,
  builder: (context) => SafeArea(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          leading: const Icon(Icons.photo_camera_outlined),
          title: const Text('Take photo'),
          onTap: () => Navigator.pop(context, PhotoSourceChoice.camera),
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined),
          title: const Text('Choose from gallery'),
          onTap: () => Navigator.pop(context, PhotoSourceChoice.gallery),
        ),
        if (allowRemove)
          ListTile(
            leading: const Icon(Icons.delete_outline),
            title: const Text('Remove photo'),
            onTap: () => Navigator.pop(context, PhotoSourceChoice.remove),
          ),
      ],
    ),
  ),
);

enum PhotoSourceChoice {
  camera,
  gallery,
  remove;

  PhotoSource? get source => switch (this) {
    camera => PhotoSource.camera,
    gallery => PhotoSource.gallery,
    remove => null,
  };
}
