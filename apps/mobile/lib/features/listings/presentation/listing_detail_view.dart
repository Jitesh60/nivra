import 'dart:typed_data';

import 'package:lucide_icons_flutter/lucide_icons.dart';

import 'package:flutter/material.dart';

import '../../../core/theme/tokens.g.dart';
import '../application/listing_draft.dart';
import '../data/models.dart';
import 'category_icon.dart';

/// What a borrower sees on a listing. Built from a draft (wizard preview) or
/// a saved listing; Phase 4 reuses it for the public detail page.
class ListingViewData {
  const ListingViewData({
    required this.title,
    required this.description,
    required this.photos,
    required this.pricePerDayPaise,
    required this.weeklyDiscountPct,
    required this.depositPaise,
    required this.minDays,
    required this.maxDays,
    required this.advanceNoticeDays,
    required this.requiredDocs,
    required this.blocks,
    this.category,
    this.condition,
    this.brand,
    this.size,
    this.areaLabel,
    this.distanceKm,
  });

  factory ListingViewData.fromDraft(ListingDraft d, Category? category) =>
      ListingViewData(
        title: d.title.trim(),
        description: d.description.trim(),
        photos: [
          for (final p in d.photos)
            switch (p) {
              RemotePhoto(:final photo) => ViewPhoto.url(photo.url),
              LocalPhoto(:final bytes) => ViewPhoto.bytes(bytes),
            },
        ],
        pricePerDayPaise: (d.pricePerDay ?? 0) * 100,
        weeklyDiscountPct: d.weeklyDiscountPct,
        depositPaise: (d.deposit ?? 0) * 100,
        minDays: d.minDays,
        maxDays: d.maxDays,
        advanceNoticeDays: d.advanceNoticeDays,
        requiredDocs: d.requiredDocs,
        blocks: d.blocks,
        category: category,
        condition: d.condition,
        brand: d.brand.trim().isEmpty ? null : d.brand.trim(),
        size: d.size.trim().isEmpty ? null : d.size.trim(),
        areaLabel: d.areaLabel.trim(),
      );

  factory ListingViewData.fromListing(MyListing l) => ListingViewData(
    title: l.title,
    description: l.description,
    photos: [for (final p in l.photos) ViewPhoto.url(p.url)],
    pricePerDayPaise: l.pricePerDayPaise,
    weeklyDiscountPct: l.weeklyDiscountPct,
    depositPaise: l.depositPaise,
    minDays: l.minDays,
    maxDays: l.maxDays,
    advanceNoticeDays: l.advanceNoticeDays,
    requiredDocs: l.requiredDocs,
    blocks: l.blocks,
    category: l.category,
    condition: l.condition,
    brand: l.brand,
    size: l.size,
    areaLabel: l.areaLabel,
  );

  final String title;
  final String description;
  final List<ViewPhoto> photos;
  final int pricePerDayPaise;
  final int weeklyDiscountPct;
  final int depositPaise;
  final int minDays;
  final int maxDays;
  final int advanceNoticeDays;
  final List<RequiredDoc> requiredDocs;
  final List<BlockedRange> blocks;
  final Category? category;
  final ItemCondition? condition;
  final String? brand;
  final String? size;
  final String? areaLabel;

  /// From the borrower's search area, already rounded.
  final double? distanceKm;
}

class ViewPhoto {
  const ViewPhoto.url(String this.url) : bytes = null;
  const ViewPhoto.bytes(Uint8List this.bytes) : url = null;
  final String? url;
  final Uint8List? bytes;

  Widget image({BoxFit fit = BoxFit.cover}) {
    Widget fallback(BuildContext _, Object _, StackTrace? _) =>
        const ColoredBox(
          color: SajhaColors.ink100,
          child: Center(child: Icon(LucideIcons.image)),
        );
    return url != null
        ? Image.network(url!, fit: fit, errorBuilder: fallback)
        : Image.memory(bytes!, fit: fit, errorBuilder: fallback);
  }
}

class ListingDetailView extends StatelessWidget {
  const ListingDetailView({
    required this.data,
    this.belowPrice,
    this.extras = const [],
    super.key,
  });

  final ListingViewData data;

  /// Shown under the price (the public page puts the date quote here).
  final Widget? belowPrice;

  /// Shown after the facts (e.g. the lender).
  final List<Widget> extras;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final weekly = data.weeklyDiscountPct > 0
        ? (data.pricePerDayPaise * 7 * (100 - data.weeklyDiscountPct) / 100)
              .round()
        : null;

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        _Gallery(photos: data.photos),
        Padding(
          padding: const EdgeInsets.all(SajhaSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (data.category != null)
                Row(
                  children: [
                    Icon(categoryIcon(data.category!.icon), size: 16),
                    const SizedBox(width: SajhaSpacing.xs),
                    Flexible(
                      child: Text(
                        data.category!.name,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: muted),
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: SajhaSpacing.xs),
              Text(data.title, style: text.headlineSmall),
              const SizedBox(height: SajhaSpacing.sm),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: formatRupees(data.pricePerDayPaise),
                      style: text.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const TextSpan(text: ' / day'),
                  ],
                ),
                key: const ValueKey('detail-price'),
              ),
              if (weekly != null)
                Text(
                  '${formatRupees(weekly)} for 7 days '
                  '(${data.weeklyDiscountPct}% off)',
                  style: TextStyle(color: muted),
                ),
              const SizedBox(height: SajhaSpacing.xs),
              Text(
                'Refundable deposit ${formatRupees(data.depositPaise)}',
                style: TextStyle(color: muted),
              ),
              if (belowPrice != null) ...[
                const SizedBox(height: SajhaSpacing.md),
                belowPrice!,
              ],
              const SizedBox(height: SajhaSpacing.md),
              Wrap(
                spacing: SajhaSpacing.sm,
                runSpacing: SajhaSpacing.sm,
                children: [
                  if (data.condition != null)
                    Chip(label: Text(data.condition!.label)),
                  if (data.brand != null) Chip(label: Text(data.brand!)),
                  if (data.size != null) Chip(label: Text('Size ${data.size}')),
                ],
              ),
              const SizedBox(height: SajhaSpacing.md),
              Text(data.description, style: text.bodyLarge),
              const Divider(height: SajhaSpacing.x2xl),
              _Fact(
                icon: LucideIcons.mapPin,
                title: [
                  data.areaLabel?.isNotEmpty == true
                      ? data.areaLabel!
                      : 'Pickup area not set',
                  if (data.distanceKm != null)
                    '${formatDistance(data.distanceKm!)} away',
                ].join(' · '),
                subtitle: 'Exact address shared after the booking is confirmed',
              ),
              _Fact(
                icon: LucideIcons.calendarCheck,
                title: data.minDays == data.maxDays
                    ? 'Rent for ${data.minDays} ${data.minDays == 1 ? 'day' : 'days'}'
                    : 'Rent for ${data.minDays}–${data.maxDays} days',
                subtitle: data.advanceNoticeDays == 0
                    ? 'Can start today'
                    : 'Book at least ${data.advanceNoticeDays} '
                          '${data.advanceNoticeDays == 1 ? 'day' : 'days'} ahead',
              ),
              if (data.blocks.isNotEmpty)
                _Fact(
                  icon: LucideIcons.calendarX,
                  title: 'Not available',
                  subtitle: data.blocks.map(formatRange).join(', '),
                ),
              _Fact(
                icon: LucideIcons.idCard,
                title: data.requiredDocs.isEmpty
                    ? 'No documents needed'
                    : 'Documents to share',
                subtitle: data.requiredDocs.isEmpty
                    ? 'Verified phone and email are enough'
                    : data.requiredDocs.map((d) => d.title).join(', '),
              ),
              ...extras,
            ],
          ),
        ),
      ],
    );
  }
}

String formatRange(BlockedRange r) {
  String d(DateTime x) => '${x.day} ${_months[x.month - 1]}';
  return r.start == r.end ? d(r.start) : '${d(r.start)} – ${d(r.end)}';
}

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

class _Gallery extends StatefulWidget {
  const _Gallery({required this.photos});
  final List<ViewPhoto> photos;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _page = 0;

  @override
  Widget build(BuildContext context) {
    if (widget.photos.isEmpty) {
      return const AspectRatio(
        aspectRatio: 4 / 3,
        child: ColoredBox(
          color: SajhaColors.ink100,
          child: Center(child: Icon(LucideIcons.image, size: 48)),
        ),
      );
    }
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: Stack(
        children: [
          PageView(
            onPageChanged: (i) => setState(() => _page = i),
            children: [for (final p in widget.photos) p.image()],
          ),
          if (widget.photos.length > 1)
            Positioned(
              right: SajhaSpacing.md,
              bottom: SajhaSpacing.md,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(SajhaRadius.full),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: SajhaSpacing.sm,
                    vertical: 2,
                  ),
                  child: Text(
                    '${_page + 1}/${widget.photos.length}',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    leading: Icon(icon),
    title: Text(title),
    subtitle: Text(subtitle),
  );
}
