import 'dart:typed_data';

import '../data/models.dart';

/// A photo in the editor: already on the server, or picked on this device.
sealed class DraftPhoto {
  const DraftPhoto();
}

class RemotePhoto extends DraftPhoto {
  const RemotePhoto(this.photo);
  final ListingPhoto photo;
}

class LocalPhoto extends DraftPhoto {
  LocalPhoto(this.bytes) : localId = _next++;
  final Uint8List bytes;
  final int localId;
  static int _next = 0;
}

/// Everything the listing wizard edits. Prices are whole rupees here and
/// paise on the wire.
class ListingDraft {
  const ListingDraft({
    this.id,
    this.status = ListingStatus.draft,
    this.photos = const [],
    this.removedPhotoIds = const {},
    this.categoryId,
    this.title = '',
    this.description = '',
    this.condition,
    this.brand = '',
    this.size = '',
    this.pricePerDay,
    this.weeklyDiscountPct = 0,
    this.deposit,
    this.minDays = 1,
    this.maxDays = 30,
    this.advanceNoticeDays = 1,
    this.blocks = const [],
    this.lat,
    this.lng,
    this.areaLabel = '',
    this.exactAddress = '',
    this.requiredDocs = const [],
    this.rejectionReason,
  });

  /// Pre-fills the editor from a saved listing.
  factory ListingDraft.fromListing(MyListing l) => ListingDraft(
    id: l.id,
    status: l.status,
    photos: [for (final p in l.photos) RemotePhoto(p)],
    categoryId: l.category.id,
    title: l.title,
    description: l.description,
    condition: l.condition,
    brand: l.brand ?? '',
    size: l.size ?? '',
    pricePerDay: l.pricePerDayPaise ~/ 100,
    weeklyDiscountPct: l.weeklyDiscountPct,
    deposit: l.depositPaise ~/ 100,
    minDays: l.minDays,
    maxDays: l.maxDays,
    advanceNoticeDays: l.advanceNoticeDays,
    blocks: l.blocks,
    lat: l.lat,
    lng: l.lng,
    areaLabel: l.areaLabel ?? '',
    exactAddress: l.exactAddress ?? '',
    requiredDocs: l.requiredDocs,
    rejectionReason: l.rejectionReason,
  );

  /// Null until the listing is first saved.
  final String? id;
  final ListingStatus status;
  final List<DraftPhoto> photos;
  final Set<String> removedPhotoIds;
  final String? categoryId;
  final String title;
  final String description;
  final ItemCondition? condition;
  final String brand;
  final String size;
  final int? pricePerDay;
  final int weeklyDiscountPct;
  final int? deposit;
  final int minDays;
  final int maxDays;
  final int advanceNoticeDays;
  final List<BlockedRange> blocks;
  final double? lat;
  final double? lng;
  final String areaLabel;
  final String exactAddress;
  final List<RequiredDoc> requiredDocs;
  final String? rejectionReason;

  bool get isNew => id == null;

  /// Saving will also publish it (new, draft, or rejected and now edited).
  bool get willPublish =>
      isNew ||
      status == ListingStatus.draft ||
      status == ListingStatus.rejected;

  /// Fields for `POST`/`PATCH /v1/me/listings`.
  Map<String, dynamic> toFields() => {
    'categoryId': categoryId,
    'title': title.trim(),
    'description': description.trim(),
    'condition': condition!.apiValue,
    if (brand.trim().isNotEmpty || !isNew) 'brand': brand.trim(),
    if (size.trim().isNotEmpty || !isNew) 'size': size.trim(),
    'pricePerDayPaise': pricePerDay! * 100,
    'weeklyDiscountPct': weeklyDiscountPct,
    'depositPaise': deposit! * 100,
    'minDays': minDays,
    'maxDays': maxDays,
    'advanceNoticeDays': advanceNoticeDays,
    'lat': lat,
    'lng': lng,
    'areaLabel': areaLabel.trim(),
    // Empty clears it on the server.
    if (exactAddress.trim().isNotEmpty || !isNew)
      'exactAddress': exactAddress.trim(),
  };

  ListingDraft copyWith({
    String? id,
    ListingStatus? status,
    List<DraftPhoto>? photos,
    Set<String>? removedPhotoIds,
    String? categoryId,
    String? title,
    String? description,
    ItemCondition? condition,
    String? brand,
    String? size,
    int? Function()? pricePerDay,
    int? weeklyDiscountPct,
    int? Function()? deposit,
    int? minDays,
    int? maxDays,
    int? advanceNoticeDays,
    List<BlockedRange>? blocks,
    double? lat,
    double? lng,
    String? areaLabel,
    String? exactAddress,
    List<RequiredDoc>? requiredDocs,
  }) => ListingDraft(
    id: id ?? this.id,
    status: status ?? this.status,
    photos: photos ?? this.photos,
    removedPhotoIds: removedPhotoIds ?? this.removedPhotoIds,
    categoryId: categoryId ?? this.categoryId,
    title: title ?? this.title,
    description: description ?? this.description,
    condition: condition ?? this.condition,
    brand: brand ?? this.brand,
    size: size ?? this.size,
    pricePerDay: pricePerDay != null ? pricePerDay() : this.pricePerDay,
    weeklyDiscountPct: weeklyDiscountPct ?? this.weeklyDiscountPct,
    deposit: deposit != null ? deposit() : this.deposit,
    minDays: minDays ?? this.minDays,
    maxDays: maxDays ?? this.maxDays,
    advanceNoticeDays: advanceNoticeDays ?? this.advanceNoticeDays,
    blocks: blocks ?? this.blocks,
    lat: lat ?? this.lat,
    lng: lng ?? this.lng,
    areaLabel: areaLabel ?? this.areaLabel,
    exactAddress: exactAddress ?? this.exactAddress,
    requiredDocs: requiredDocs ?? this.requiredDocs,
    rejectionReason: rejectionReason,
  );
}

/// The wizard's steps, in order.
enum ListingStep {
  photos('Photos'),
  details('Details'),
  pricing('Price'),
  availability('Availability'),
  location('Pickup'),
  documents('Documents'),
  preview('Preview');

  const ListingStep(this.title);
  final String title;
}

/// What's missing on [step], as messages for the user; empty when it's done.
List<String> validateStep(ListingStep step, ListingDraft d, MarketRules r) {
  switch (step) {
    case ListingStep.photos:
      return [
        if (d.photos.length < r.photos.min) 'Add at least one photo.',
        if (d.photos.length > r.photos.max)
          'Use at most ${r.photos.max} photos.',
      ];
    case ListingStep.details:
      return [
        if (d.categoryId == null) 'Choose a category.',
        if (d.title.trim().length < 5) 'Give it a title (5+ characters).',
        if (d.title.trim().length > 80) 'Keep the title under 80 characters.',
        if (d.description.trim().length < 20)
          'Describe it in a sentence or two (20+ characters).',
        if (d.condition == null) 'Choose its condition.',
      ];
    case ListingStep.pricing:
      final price = d.pricePerDay;
      final deposit = d.deposit;
      return [
        if (price == null || !r.pricePerDayPaise.contains(price * 100))
          'Price per day must be ${formatRupees(r.pricePerDayPaise.min)}–'
              '${formatRupees(r.pricePerDayPaise.max)}.',
        if (deposit == null || !r.depositPaise.contains(deposit * 100))
          'Deposit must be ${formatRupees(r.depositPaise.min)}–'
              '${formatRupees(r.depositPaise.max)}.',
      ];
    case ListingStep.availability:
      return [
        if (d.minDays > d.maxDays)
          'Minimum days can’t be more than maximum days.',
        if (d.blocks.length > r.maxBlockedRanges)
          'Use at most ${r.maxBlockedRanges} blocked date ranges.',
      ];
    case ListingStep.location:
      return [
        if (d.lat == null || d.lng == null) 'Set the pickup point on the map.',
        if (d.areaLabel.trim().length < 2)
          'Name the area, e.g. “Kothrud, Pune”.',
      ];
    case ListingStep.documents:
      return [
        for (final doc in d.requiredDocs)
          if (doc.type == RequiredDocType.other &&
              (doc.note ?? '').trim().length < 2)
            'Describe the “something else” document.',
      ];
    case ListingStep.preview:
      return [
        for (final s in ListingStep.values.take(ListingStep.values.length - 1))
          ...validateStep(s, d, r),
      ];
  }
}
