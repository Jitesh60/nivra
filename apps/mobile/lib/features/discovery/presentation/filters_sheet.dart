import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/tokens.g.dart';
import '../../listings/data/listings_repository.dart';
import '../../listings/data/models.dart';
import '../application/search_area.dart';
import '../data/models.dart';

/// Returns the new filters, or null if dismissed. Distance changes the saved
/// search area directly.
Future<SearchFilters?> showFiltersSheet(
  BuildContext context,
  SearchFilters current,
) => showModalBottomSheet<SearchFilters>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => FiltersSheet(initial: current),
);

class FiltersSheet extends ConsumerStatefulWidget {
  const FiltersSheet({required this.initial, super.key});

  final SearchFilters initial;

  @override
  ConsumerState<FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends ConsumerState<FiltersSheet> {
  late String? _categoryId = widget.initial.categoryId;
  late final Set<ItemCondition> _conditions = {...widget.initial.conditions};
  late bool _verifiedOnly = widget.initial.verifiedOnly;
  late final _min = TextEditingController(
    text: _rupees(widget.initial.minPricePaise),
  );
  late final _max = TextEditingController(
    text: _rupees(widget.initial.maxPricePaise),
  );
  int? _radius;

  static String _rupees(int? paise) =>
      paise == null ? '' : (paise ~/ 100).toString();

  static int? _paise(String text) {
    final v = int.tryParse(text.trim());
    return v == null || v <= 0 ? null : v * 100;
  }

  @override
  void dispose() {
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  void _reset() => setState(() {
    _categoryId = null;
    _conditions.clear();
    _verifiedOnly = false;
    _min.clear();
    _max.clear();
  });

  void _apply() {
    var min = _paise(_min.text);
    var max = _paise(_max.text);
    if (min != null && max != null && min > max) (min, max) = (max, min);
    if (_radius != null) {
      ref.read(searchAreaProvider.notifier).setRadius(_radius!);
    }
    Navigator.pop(
      context,
      widget.initial.copyWith(
        categoryId: () => _categoryId,
        minPricePaise: () => min,
        maxPricePaise: () => max,
        conditions: {..._conditions},
        verifiedOnly: _verifiedOnly,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final categories = ref.watch(categoriesProvider).value ?? const [];
    final area = ref.watch(searchAreaProvider).value;
    final radius = _radius ?? area?.radiusKm;
    Widget heading(String label) => Padding(
      padding: const EdgeInsets.only(
        top: SajhaSpacing.lg,
        bottom: SajhaSpacing.sm,
      ),
      child: Text(label, style: text.titleSmall),
    );

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.symmetric(horizontal: SajhaSpacing.lg),
              children: [
                Row(
                  children: [
                    Expanded(child: Text('Filters', style: text.titleLarge)),
                    TextButton(
                      key: const ValueKey('filter-reset'),
                      onPressed: _reset,
                      child: const Text('Reset'),
                    ),
                  ],
                ),
                if (area != null && radius != null) ...[
                  heading('Distance: within $radius km'),
                  Slider(
                    key: const ValueKey('filter-radius'),
                    value: radius.toDouble(),
                    min: SearchArea.minRadiusKm.toDouble(),
                    max: SearchArea.maxRadiusKm.toDouble(),
                    divisions: SearchArea.maxRadiusKm - SearchArea.minRadiusKm,
                    label: '$radius km',
                    onChanged: (v) => setState(() => _radius = v.round()),
                  ),
                ],
                heading('Category'),
                Wrap(
                  spacing: SajhaSpacing.sm,
                  runSpacing: SajhaSpacing.sm,
                  children: [
                    ChoiceChip(
                      key: const ValueKey('filter-cat-all'),
                      label: const Text('All'),
                      selected: _categoryId == null,
                      onSelected: (_) => setState(() => _categoryId = null),
                    ),
                    for (final c in categories)
                      ChoiceChip(
                        key: ValueKey('filter-cat-${c.slug}'),
                        label: Text(c.name),
                        selected: _categoryId == c.id,
                        onSelected: (_) => setState(() => _categoryId = c.id),
                      ),
                  ],
                ),
                heading('Price per day'),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        key: const ValueKey('filter-min-price'),
                        controller: _min,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        decoration: const InputDecoration(
                          labelText: 'Min',
                          prefixText: '₹ ',
                        ),
                      ),
                    ),
                    const SizedBox(width: SajhaSpacing.md),
                    Expanded(
                      child: TextField(
                        key: const ValueKey('filter-max-price'),
                        controller: _max,
                        keyboardType: TextInputType.number,
                        inputFormatters: [
                          FilteringTextInputFormatter.digitsOnly,
                        ],
                        decoration: const InputDecoration(
                          labelText: 'Max',
                          prefixText: '₹ ',
                        ),
                      ),
                    ),
                  ],
                ),
                heading('Condition'),
                Wrap(
                  spacing: SajhaSpacing.sm,
                  runSpacing: SajhaSpacing.sm,
                  children: [
                    for (final c in ItemCondition.values)
                      FilterChip(
                        key: ValueKey('filter-cond-${c.apiValue}'),
                        label: Text(c.label),
                        selected: _conditions.contains(c),
                        onSelected: (on) => setState(
                          () => on ? _conditions.add(c) : _conditions.remove(c),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: SajhaSpacing.md),
                SwitchListTile(
                  key: const ValueKey('filter-verified'),
                  contentPadding: EdgeInsets.zero,
                  value: _verifiedOnly,
                  onChanged: (v) => setState(() => _verifiedOnly = v),
                  title: const Text('ID-verified lenders only'),
                  subtitle: const Text(
                    'Lenders whose government ID Sajha has checked',
                  ),
                ),
                const SizedBox(height: SajhaSpacing.lg),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(SajhaSpacing.md),
              child: FilledButton(
                key: const ValueKey('filter-apply'),
                onPressed: _apply,
                child: const Text('Show results'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
