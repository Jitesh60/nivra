import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/config/providers.dart';
import '../../../core/theme/tokens.g.dart';

/// Whether to load map tiles over the network (tests turn it off).
final mapTilesEnabledProvider = Provider<bool>((ref) => true);

/// India, for a first look before the lender's position is known.
const indiaCenter = LatLng(20.59, 78.96);

/// A map with a fixed centre pin: the lender moves the map, not the pin.
/// Calls [onMoved] with the centre after every drag or zoom by the lender.
class PickupMap extends ConsumerStatefulWidget {
  const PickupMap({
    required this.controller,
    required this.onMoved,
    this.initial,
    super.key,
  });

  final MapController controller;
  final LatLng? initial;
  final ValueChanged<LatLng> onMoved;

  @override
  ConsumerState<PickupMap> createState() => _PickupMapState();
}

class _PickupMapState extends ConsumerState<PickupMap> {
  @override
  Widget build(BuildContext context) {
    final tiles = ref.watch(mapTilesEnabledProvider);
    final url = ref.watch(appConfigProvider).mapTileUrl;
    return ClipRRect(
      borderRadius: BorderRadius.circular(SajhaRadius.lg),
      child: Stack(
        alignment: Alignment.center,
        children: [
          FlutterMap(
            mapController: widget.controller,
            options: MapOptions(
              initialCenter: widget.initial ?? indiaCenter,
              initialZoom: widget.initial == null ? 4.5 : 15,
              minZoom: 3,
              maxZoom: 18,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
              ),
              // Only the lender's own drags move the pin; layout and
              // programmatic moves must not set it by accident.
              onPositionChanged: (camera, hasGesture) {
                if (hasGesture) widget.onMoved(camera.center);
              },
            ),
            children: [
              if (tiles)
                TileLayer(
                  urlTemplate: url,
                  userAgentPackageName: 'com.sajha.app',
                  maxNativeZoom: 19,
                )
              else
                const ColoredBox(color: SajhaColors.brand50),
              const SimpleAttributionWidget(
                source: Text('OpenStreetMap contributors'),
              ),
            ],
          ),
          // The pin's tip sits on the map centre.
          const IgnorePointer(
            child: Padding(
              padding: EdgeInsets.only(bottom: 40),
              child: Icon(
                Icons.location_on,
                key: ValueKey('map-pin'),
                size: 44,
                color: SajhaColors.accent600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
