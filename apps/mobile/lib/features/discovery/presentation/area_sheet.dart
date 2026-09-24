import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/search_area.dart';

Future<void> showAreaSheet(BuildContext context) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => const AreaSheet(),
);

/// Choose where to search (GPS or the map) and how far out.
class AreaSheet extends ConsumerStatefulWidget {
  const AreaSheet({super.key});

  @override
  ConsumerState<AreaSheet> createState() => _AreaSheetState();
}

class _AreaSheetState extends ConsumerState<AreaSheet> {
  bool _locating = false;
  String? _problem;
  double? _radius; // While dragging.

  Future<void> _useGps() async {
    setState(() {
      _locating = true;
      _problem = null;
    });
    final problem = await ref
        .read(searchAreaProvider.notifier)
        .useCurrentLocation();
    if (!mounted) return;
    setState(() {
      _locating = false;
      _problem = problem == null ? null : locationProblemMessage(problem);
    });
    if (problem == null) Navigator.pop(context);
  }

  void _pickOnMap() {
    final router = GoRouter.of(context);
    Navigator.pop(context);
    router.push(Routes.areaPicker);
  }

  @override
  Widget build(BuildContext context) {
    final area = ref.watch(searchAreaProvider).value;
    final text = Theme.of(context).textTheme;
    final radius = _radius ?? area?.radiusKm.toDouble();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          SajhaSpacing.lg,
          0,
          SajhaSpacing.lg,
          SajhaSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Where are you looking?', style: text.titleLarge),
            const SizedBox(height: SajhaSpacing.xs),
            Text(
              'We show items lenders can hand over near you.',
              style: text.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: SajhaSpacing.md),
            ListTile(
              key: const ValueKey('area-gps'),
              contentPadding: EdgeInsets.zero,
              leading: _locating
                  ? const SizedBox.square(
                      dimension: 24,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.my_location),
              title: const Text('Use my current location'),
              enabled: !_locating,
              onTap: _useGps,
            ),
            ListTile(
              key: const ValueKey('area-map'),
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.map_outlined),
              title: const Text('Pick on the map'),
              onTap: _pickOnMap,
            ),
            if (_problem != null)
              Padding(
                padding: const EdgeInsets.only(top: SajhaSpacing.sm),
                child: Text(
                  _problem!,
                  key: const ValueKey('area-problem'),
                  style: const TextStyle(color: SajhaColors.danger),
                ),
              ),
            if (area != null && radius != null) ...[
              const Divider(height: SajhaSpacing.xl),
              Text(
                'Within ${radius.round()} km of ${area.label.toLowerCase()}',
                style: text.titleSmall,
              ),
              Slider(
                key: const ValueKey('radius-slider'),
                value: radius,
                min: SearchArea.minRadiusKm.toDouble(),
                max: SearchArea.maxRadiusKm.toDouble(),
                divisions: SearchArea.maxRadiusKm - SearchArea.minRadiusKm,
                label: '${radius.round()} km',
                onChanged: (v) => setState(() => _radius = v),
                onChangeEnd: (v) {
                  ref.read(searchAreaProvider.notifier).setRadius(v.round());
                  setState(() => _radius = null);
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}
