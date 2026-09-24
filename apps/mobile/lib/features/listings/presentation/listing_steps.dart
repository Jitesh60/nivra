import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/location/location_service.dart';
import '../../../core/media/photo_picker.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/listing_draft.dart';
import '../application/listing_editor.dart';
import '../data/models.dart';
import 'category_icon.dart';
import 'listing_detail_view.dart';
import 'pickup_map.dart';

ListingEditor _editor(WidgetRef ref) =>
    ref.read(listingEditorProvider.notifier);

Widget _hint(BuildContext context, String text) => Padding(
  padding: const EdgeInsets.only(bottom: SajhaSpacing.md),
  child: Text(
    text,
    style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
  ),
);

// ── 1. Photos ──

class PhotosStep extends ConsumerWidget {
  const PhotosStep({required this.rules, super.key});
  final MarketRules rules;

  Future<void> _add(BuildContext context, WidgetRef ref, bool camera) async {
    final picker = ref.read(photoPickerProvider);
    final room =
        rules.photos.max - ref.read(listingEditorProvider).photos.length;
    if (room <= 0) return;
    final picked = camera
        ? [?await picker.pick(PhotoSource.camera)]
        : await picker.pickMany(limit: room);
    _editor(ref).addPhotos([for (final b in picked.take(room)) LocalPhoto(b)]);
  }

  Future<void> _actions(
    BuildContext context,
    WidgetRef ref,
    DraftPhoto p,
  ) async {
    final isCover = identical(ref.read(listingEditorProvider).photos.first, p);
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isCover)
              ListTile(
                leading: const Icon(Icons.star_outline),
                title: const Text('Make cover photo'),
                onTap: () => Navigator.pop(context, 'cover'),
              ),
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Remove'),
              onTap: () => Navigator.pop(context, 'remove'),
            ),
          ],
        ),
      ),
    );
    if (action == 'cover') _editor(ref).makeCover(p);
    if (action == 'remove') _editor(ref).removePhoto(p);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final photos = ref.watch(listingEditorProvider).photos;
    final full = photos.length >= rules.photos.max;
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        _hint(
          context,
          'Add up to ${rules.photos.max} clear photos in good light. The first '
          'one is the cover. Show any wear or damage honestly.',
        ),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: SajhaSpacing.sm,
          crossAxisSpacing: SajhaSpacing.sm,
          children: [
            for (final (i, p) in photos.indexed)
              InkWell(
                key: ValueKey('photo-$i'),
                onTap: () => _actions(context, ref, p),
                borderRadius: BorderRadius.circular(SajhaRadius.md),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(SajhaRadius.md),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      switch (p) {
                        RemotePhoto(:final photo) => ViewPhoto.url(
                          photo.thumbUrl,
                        ).image(),
                        LocalPhoto(:final bytes) => ViewPhoto.bytes(
                          bytes,
                        ).image(),
                      },
                      if (i == 0)
                        const Positioned(
                          left: 4,
                          top: 4,
                          child: Chip(
                            label: Text('Cover'),
                            visualDensity: VisualDensity.compact,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: SajhaSpacing.md),
        Text('${photos.length} of ${rules.photos.max} photos'),
        const SizedBox(height: SajhaSpacing.sm),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                key: const ValueKey('add-photos'),
                onPressed: full ? null : () => _add(context, ref, false),
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Choose photos'),
              ),
            ),
            const SizedBox(width: SajhaSpacing.sm),
            Expanded(
              child: OutlinedButton.icon(
                key: const ValueKey('take-photo'),
                onPressed: full ? null : () => _add(context, ref, true),
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Take photo'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── 2. Details ──

class DetailsStep extends ConsumerStatefulWidget {
  const DetailsStep({required this.categories, super.key});
  final List<Category> categories;

  @override
  ConsumerState<DetailsStep> createState() => _DetailsStepState();
}

class _DetailsStepState extends ConsumerState<DetailsStep> {
  late final TextEditingController _title;
  late final TextEditingController _description;
  late final TextEditingController _brand;
  late final TextEditingController _size;

  @override
  void initState() {
    super.initState();
    final d = ref.read(listingEditorProvider);
    _title = TextEditingController(text: d.title);
    _description = TextEditingController(text: d.description);
    _brand = TextEditingController(text: d.brand);
    _size = TextEditingController(text: d.size);
  }

  @override
  void dispose() {
    for (final c in [_title, _description, _brand, _size]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(listingEditorProvider);
    final text = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        Text('Category', style: text.titleSmall),
        const SizedBox(height: SajhaSpacing.sm),
        Wrap(
          spacing: SajhaSpacing.sm,
          runSpacing: SajhaSpacing.sm,
          children: [
            for (final c in widget.categories)
              ChoiceChip(
                key: ValueKey('category-${c.slug}'),
                avatar: Icon(categoryIcon(c.icon), size: 18),
                label: Text(c.name),
                selected: draft.categoryId == c.id,
                onSelected: (_) =>
                    _editor(ref).update((d) => d.copyWith(categoryId: c.id)),
              ),
          ],
        ),
        const SizedBox(height: SajhaSpacing.lg),
        TextField(
          key: const ValueKey('listing-title'),
          controller: _title,
          maxLength: 80,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Title',
            hintText: 'e.g. Quechua 2-person trekking tent',
          ),
          onChanged: (v) => _editor(ref).update((d) => d.copyWith(title: v)),
        ),
        const SizedBox(height: SajhaSpacing.sm),
        TextField(
          key: const ValueKey('listing-description'),
          controller: _description,
          maxLength: 2000,
          minLines: 3,
          maxLines: 8,
          textCapitalization: TextCapitalization.sentences,
          decoration: const InputDecoration(
            labelText: 'Description',
            hintText: 'What’s included, how it’s been used, anything to know',
            alignLabelWithHint: true,
          ),
          onChanged: (v) =>
              _editor(ref).update((d) => d.copyWith(description: v)),
        ),
        const SizedBox(height: SajhaSpacing.sm),
        Text('Condition', style: text.titleSmall),
        const SizedBox(height: SajhaSpacing.sm),
        Wrap(
          spacing: SajhaSpacing.sm,
          children: [
            for (final c in ItemCondition.values)
              ChoiceChip(
                key: ValueKey('condition-${c.apiValue}'),
                label: Text(c.label),
                selected: draft.condition == c,
                onSelected: (_) =>
                    _editor(ref).update((d) => d.copyWith(condition: c)),
              ),
          ],
        ),
        const SizedBox(height: SajhaSpacing.lg),
        Row(
          children: [
            Expanded(
              child: TextField(
                key: const ValueKey('listing-brand'),
                controller: _brand,
                maxLength: 40,
                decoration: const InputDecoration(
                  labelText: 'Brand (optional)',
                  counterText: '',
                ),
                onChanged: (v) =>
                    _editor(ref).update((d) => d.copyWith(brand: v)),
              ),
            ),
            const SizedBox(width: SajhaSpacing.md),
            Expanded(
              child: TextField(
                key: const ValueKey('listing-size'),
                controller: _size,
                maxLength: 40,
                decoration: const InputDecoration(
                  labelText: 'Size (optional)',
                  hintText: 'e.g. UK 9',
                  counterText: '',
                ),
                onChanged: (v) =>
                    _editor(ref).update((d) => d.copyWith(size: v)),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ── 3. Pricing ──

class PricingStep extends ConsumerStatefulWidget {
  const PricingStep({required this.rules, super.key});
  final MarketRules rules;

  @override
  ConsumerState<PricingStep> createState() => _PricingStepState();
}

class _PricingStepState extends ConsumerState<PricingStep> {
  late final TextEditingController _price;
  late final TextEditingController _deposit;

  @override
  void initState() {
    super.initState();
    final d = ref.read(listingEditorProvider);
    _price = TextEditingController(text: d.pricePerDay?.toString() ?? '');
    _deposit = TextEditingController(text: d.deposit?.toString() ?? '');
  }

  @override
  void dispose() {
    _price.dispose();
    _deposit.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(listingEditorProvider);
    final r = widget.rules;
    final price = draft.pricePerDay;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final pct = r.commissionBps / 100;

    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        TextField(
          key: const ValueKey('listing-price'),
          controller: _price,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(
            labelText: 'Price per day',
            prefixText: '₹ ',
          ),
          onChanged: (v) => _editor(ref)
              .update((d) => d.copyWith(pricePerDay: () => int.tryParse(v))),
        ),
        const SizedBox(height: SajhaSpacing.xs),
        Text(
          price == null || price == 0
              ? 'Tip: 5–10% of the item’s price per day is a good start.'
              : 'You earn ${formatRupees(r.lenderEarnings(price * 100))}/day '
                    'after Sajha’s ${pct.toStringAsFixed(pct % 1 == 0 ? 0 : 1)}% fee.',
          key: const ValueKey('earnings'),
          style: TextStyle(color: muted),
        ),
        const SizedBox(height: SajhaSpacing.lg),
        Text(
          'Discount for 7+ days: ${draft.weeklyDiscountPct}%',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        Slider(
          key: const ValueKey('weekly-discount'),
          value: draft.weeklyDiscountPct.toDouble(),
          max: r.weeklyDiscountPct.max.toDouble(),
          divisions: r.weeklyDiscountPct.max ~/ 5,
          label: '${draft.weeklyDiscountPct}%',
          onChanged: (v) =>
              _editor(ref)
                  .update((d) => d.copyWith(weeklyDiscountPct: v.round())),
        ),
        if (price != null && price > 0 && draft.weeklyDiscountPct > 0)
          Text(
            '7 days cost ${formatRupees((price * 7 * (100 - draft.weeklyDiscountPct)).round())} '
            'instead of ${formatRupees(price * 700)}.',
            style: TextStyle(color: muted),
          ),
        const SizedBox(height: SajhaSpacing.lg),
        TextField(
          key: const ValueKey('listing-deposit'),
          controller: _deposit,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: InputDecoration(
            labelText: 'Refundable deposit',
            prefixText: '₹ ',
            helperText:
                'Returned to the borrower after a safe return. 20–50% of the '
                'item’s value is typical (max ${formatRupees(r.depositPaise.max)}).',
            helperMaxLines: 3,
          ),
          onChanged: (v) =>
              _editor(ref)
                  .update((d) => d.copyWith(deposit: () => int.tryParse(v))),
        ),
      ],
    );
  }
}

// ── 4. Availability ──

class AvailabilityStep extends ConsumerWidget {
  const AvailabilityStep({required this.rules, super.key});
  final MarketRules rules;

  Future<void> _block(BuildContext context, WidgetRef ref) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final range = await showDateRangePicker(
      context: context,
      firstDate: today,
      lastDate: today.add(const Duration(days: 365)),
      helpText: 'Dates it’s not available',
      saveText: 'Block',
    );
    if (range == null) return;
    _editor(ref).update(
      (d) => d.copyWith(
        blocks: [...d.blocks, BlockedRange(range.start, range.end)]
          ..sort((a, b) => a.start.compareTo(b.start)),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(listingEditorProvider);
    final days = rules.rentalDays;
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        _Counter(
          keyName: 'min-days',
          label: 'Minimum rental',
          value: d.minDays,
          unit: 'day',
          min: days.min,
          max: d.maxDays,
          onChanged: (v) => _editor(ref).update((d) => d.copyWith(minDays: v)),
        ),
        _Counter(
          keyName: 'max-days',
          label: 'Maximum rental',
          value: d.maxDays,
          unit: 'day',
          min: d.minDays,
          max: days.max,
          onChanged: (v) => _editor(ref).update((d) => d.copyWith(maxDays: v)),
        ),
        _Counter(
          keyName: 'notice-days',
          label: 'Advance notice',
          value: d.advanceNoticeDays,
          unit: 'day',
          min: rules.advanceNoticeDays.min,
          max: rules.advanceNoticeDays.max,
          onChanged: (v) =>
              _editor(ref).update((d) => d.copyWith(advanceNoticeDays: v)),
        ),
        const Divider(height: SajhaSpacing.xl),
        Text('Blocked dates', style: Theme.of(context).textTheme.titleSmall),
        _hint(
          context,
          'Days you need the item yourself. You can change these later.',
        ),
        Wrap(
          spacing: SajhaSpacing.sm,
          runSpacing: SajhaSpacing.sm,
          children: [
            for (final b in d.blocks)
              InputChip(
                label: Text(formatRange(b)),
                onDeleted: () => _editor(
                  ref,
                ).update((d) => d.copyWith(blocks: [...d.blocks]..remove(b))),
              ),
          ],
        ),
        const SizedBox(height: SajhaSpacing.sm),
        Align(
          alignment: Alignment.centerLeft,
          child: OutlinedButton.icon(
            key: const ValueKey('block-dates'),
            onPressed: d.blocks.length >= rules.maxBlockedRanges
                ? null
                : () => _block(context, ref),
            icon: const Icon(Icons.event_busy_outlined),
            label: const Text('Block dates'),
          ),
        ),
      ],
    );
  }
}

class _Counter extends StatelessWidget {
  const _Counter({
    required this.keyName,
    required this.label,
    required this.value,
    required this.unit,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String keyName;
  final String label;
  final int value;
  final String unit;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    subtitle: Text(
      '$value $unit${value == 1 ? '' : 's'}',
      key: ValueKey('$keyName-value'),
    ),
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          key: ValueKey('$keyName-minus'),
          tooltip: 'Less',
          onPressed: value > min ? () => onChanged(value - 1) : null,
          icon: const Icon(Icons.remove_circle_outline),
        ),
        IconButton(
          key: ValueKey('$keyName-plus'),
          tooltip: 'More',
          onPressed: value < max ? () => onChanged(value + 1) : null,
          icon: const Icon(Icons.add_circle_outline),
        ),
      ],
    ),
  );
}

// ── 5. Location ──

class LocationStep extends ConsumerStatefulWidget {
  const LocationStep({super.key});

  @override
  ConsumerState<LocationStep> createState() => _LocationStepState();
}

class _LocationStepState extends ConsumerState<LocationStep> {
  final _map = MapController();
  late final TextEditingController _area;
  late final TextEditingController _address;
  bool _locating = false;

  @override
  void initState() {
    super.initState();
    final d = ref.read(listingEditorProvider);
    _area = TextEditingController(text: d.areaLabel);
    _address = TextEditingController(text: d.exactAddress);
  }

  @override
  void dispose() {
    _area.dispose();
    _address.dispose();
    _map.dispose();
    super.dispose();
  }

  void _set(LatLng p) =>
      _editor(ref).update((d) => d.copyWith(lat: p.latitude, lng: p.longitude));

  Future<void> _useMyLocation() async {
    setState(() => _locating = true);
    final result = await ref.read(locationServiceProvider).current();
    if (!mounted) return;
    setState(() => _locating = false);
    final position = result.position;
    if (position == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(switch (result.problem!) {
            LocationProblem.serviceOff =>
              'Turn on location services, or move the map.',
            LocationProblem.denied || LocationProblem.deniedForever => 'Location permission is off. Move the map to your pickup point instead.',
            LocationProblem.unavailable =>
              'Couldn’t find your location. Move the map instead.',
          }),
        ),
      );
      return;
    }
    _set(position);
    _map.move(position, 16);
  }

  @override
  Widget build(BuildContext context) {
    final d = ref.watch(listingEditorProvider);
    final set = d.lat != null && d.lng != null;
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        _hint(
          context,
          'Move the map so the pin is on your pickup point. Borrowers only see '
          'the area, never the exact spot, until a booking is confirmed.',
        ),
        SizedBox(
          height: 260,
          child: PickupMap(
            controller: _map,
            initial: set ? LatLng(d.lat!, d.lng!) : null,
            onMoved: _set,
          ),
        ),
        const SizedBox(height: SajhaSpacing.sm),
        Row(
          children: [
            Expanded(
              child: Text(
                set ? 'Pin set' : 'Pin not set yet',
                key: const ValueKey('pin-status'),
              ),
            ),
            TextButton.icon(
              key: const ValueKey('use-my-location'),
              onPressed: _locating ? null : _useMyLocation,
              icon: const Icon(Icons.my_location),
              label: Text(_locating ? 'Locating…' : 'Use my location'),
            ),
          ],
        ),
        const SizedBox(height: SajhaSpacing.md),
        TextField(
          key: const ValueKey('area-label'),
          controller: _area,
          maxLength: 80,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Area (shown to borrowers)',
            hintText: 'e.g. Kothrud, Pune',
          ),
          onChanged: (v) =>
              _editor(ref).update((d) => d.copyWith(areaLabel: v)),
        ),
        const SizedBox(height: SajhaSpacing.sm),
        TextField(
          key: const ValueKey('exact-address'),
          controller: _address,
          maxLength: 300,
          maxLines: 2,
          decoration: const InputDecoration(
            labelText: 'Exact address (optional, private)',
            helperText:
                'Stored encrypted. Shared only with a confirmed borrower.',
            prefixIcon: Icon(Icons.lock_outline),
          ),
          onChanged: (v) =>
              _editor(ref).update((d) => d.copyWith(exactAddress: v)),
        ),
      ],
    );
  }
}

// ── 6. Documents ──

class DocumentsStep extends ConsumerStatefulWidget {
  const DocumentsStep({super.key});

  @override
  ConsumerState<DocumentsStep> createState() => _DocumentsStepState();
}

class _DocumentsStepState extends ConsumerState<DocumentsStep> {
  late final TextEditingController _note;

  @override
  void initState() {
    super.initState();
    final other = ref
        .read(listingEditorProvider)
        .requiredDocs
        .where((d) => d.type == RequiredDocType.other)
        .firstOrNull;
    _note = TextEditingController(text: other?.note ?? '');
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _toggle(RequiredDocType type, bool on) => _editor(ref).update(
    (d) => d.copyWith(
      requiredDocs: [
        for (final t in RequiredDocType.values)
          if (t == type ? on : d.requiredDocs.any((x) => x.type == t))
            RequiredDoc(t, t == RequiredDocType.other ? _note.text : null),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final docs = ref.watch(listingEditorProvider).requiredDocs;
    bool has(RequiredDocType t) => docs.any((d) => d.type == t);
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        _hint(
          context,
          'Ask for documents only if you need them. Borrowers share them for '
          'one booking only, and they’re deleted after the rental.',
        ),
        for (final t in RequiredDocType.values)
          CheckboxListTile(
            key: ValueKey('doc-${t.apiValue}'),
            contentPadding: EdgeInsets.zero,
            value: has(t),
            title: Text(t.label),
            subtitle: Text(t.hint),
            onChanged: (v) => _toggle(t, v ?? false),
          ),
        if (has(RequiredDocType.other))
          TextField(
            key: const ValueKey('doc-other-note'),
            controller: _note,
            maxLength: 80,
            decoration: const InputDecoration(
              labelText: 'Which document?',
              hintText: 'e.g. Trek permit',
            ),
            onChanged: (_) => _toggle(RequiredDocType.other, true),
          ),
      ],
    );
  }
}

// ── 7. Preview ──

class PreviewStep extends ConsumerWidget {
  const PreviewStep({required this.categories, required this.rules, super.key});
  final List<Category> categories;
  final MarketRules rules;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final d = ref.watch(listingEditorProvider);
    final problems = validateStep(ListingStep.preview, d, rules);
    final category = categories.where((c) => c.id == d.categoryId).firstOrNull;
    return Column(
      children: [
        if (problems.isNotEmpty)
          MaterialBanner(
            content: Text(problems.join('\n')),
            leading: const Icon(Icons.error_outline),
            actions: const [SizedBox.shrink()],
          ),
        Expanded(
          child: ListingDetailView(
            data: ListingViewData.fromDraft(d, category),
          ),
        ),
      ],
    );
  }
}
