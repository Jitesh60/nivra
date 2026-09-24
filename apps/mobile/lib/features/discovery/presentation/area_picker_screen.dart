import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/theme/tokens.g.dart';
import '../../listings/presentation/pickup_map.dart';
import '../application/search_area.dart';

/// Search around a spot on the map instead of the device's position.
class AreaPickerScreen extends ConsumerStatefulWidget {
  const AreaPickerScreen({super.key});

  @override
  ConsumerState<AreaPickerScreen> createState() => _AreaPickerScreenState();
}

class _AreaPickerScreenState extends ConsumerState<AreaPickerScreen> {
  final _map = MapController();
  LatLng? _center;

  @override
  void dispose() {
    _map.dispose();
    super.dispose();
  }

  Future<void> _use(LatLng point) async {
    await ref.read(searchAreaProvider.notifier).usePoint(point);
    if (mounted) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final initial = ref.watch(searchAreaProvider).value?.point;
    final chosen = _center ?? initial;

    return Scaffold(
      appBar: AppBar(title: const Text('Pick your area')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(SajhaSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Move the map so the pin sits where you’d pick things up.',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: SajhaSpacing.md),
              Expanded(
                child: PickupMap(
                  controller: _map,
                  initial: initial,
                  onMoved: (c) => setState(() => _center = c),
                ),
              ),
              const SizedBox(height: SajhaSpacing.md),
              FilledButton(
                key: const ValueKey('use-area'),
                onPressed: chosen == null ? null : () => _use(chosen),
                child: const Text('Search around here'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
