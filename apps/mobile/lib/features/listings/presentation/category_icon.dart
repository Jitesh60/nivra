import 'package:flutter/material.dart';

/// Material icon for a category's `icon` name (admins pick from Material
/// Symbols names). Unknown names fall back to a generic icon.
IconData categoryIcon(String name) => switch (name) {
  'hiking' => Icons.hiking,
  'photo_camera' => Icons.photo_camera_outlined,
  'handyman' => Icons.handyman_outlined,
  'sports_tennis' => Icons.sports_tennis,
  'celebration' => Icons.celebration_outlined,
  'luggage' => Icons.luggage_outlined,
  'menu_book' => Icons.menu_book_outlined,
  'child_friendly' => Icons.child_friendly_outlined,
  'checkroom' => Icons.checkroom_outlined,
  'music_note' => Icons.music_note_outlined,
  'directions_bike' => Icons.directions_bike,
  'camping' => Icons.cabin_outlined,
  'kitchen' => Icons.kitchen_outlined,
  'videogame_asset' => Icons.videogame_asset_outlined,
  _ => Icons.category_outlined,
};
