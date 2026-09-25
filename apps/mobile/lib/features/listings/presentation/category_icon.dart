import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

/// Material icon for a category's `icon` name (admins pick from Material
/// Symbols names). Unknown names fall back to a generic icon.
IconData categoryIcon(String name) => switch (name) {
  'hiking' => LucideIcons.mountain,
  'photo_camera' => LucideIcons.camera,
  'handyman' => LucideIcons.wrench,
  'sports_tennis' => LucideIcons.volleyball,
  'celebration' => LucideIcons.partyPopper,
  'luggage' => LucideIcons.luggage,
  'menu_book' => LucideIcons.bookOpen,
  'child_friendly' => LucideIcons.baby,
  'checkroom' => LucideIcons.shirt,
  'music_note' => LucideIcons.music,
  'directions_bike' => LucideIcons.bike,
  'camping' => LucideIcons.tent,
  'kitchen' => LucideIcons.cookingPot,
  'videogame_asset' => LucideIcons.gamepad2,
  _ => LucideIcons.layoutGrid,
};
