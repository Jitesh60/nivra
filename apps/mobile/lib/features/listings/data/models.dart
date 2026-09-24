/// Listings, categories and the marketplace rules, as the API returns them.
/// Money is in paise throughout; format it with `formatRupees`.
library;

class Category {
  const Category({
    required this.id,
    required this.name,
    required this.slug,
    required this.icon,
  });

  factory Category.fromJson(Map<String, dynamic> json) => Category(
    id: json['id'] as String,
    name: json['name'] as String,
    slug: json['slug'] as String,
    icon: json['icon'] as String,
  );

  final String id;
  final String name;
  final String slug;

  /// Material Symbols name, e.g. "hiking".
  final String icon;
}

class Range {
  const Range(this.min, this.max);

  factory Range.fromJson(Map<String, dynamic> json) =>
      Range((json['min'] as num).toInt(), (json['max'] as num).toInt());

  final int min;
  final int max;

  bool contains(int value) => value >= min && value <= max;
}

/// `GET /v1/config`: commission and limits, so the app never hard-codes them.
class MarketRules {
  const MarketRules({
    required this.commissionBps,
    required this.pricePerDayPaise,
    required this.depositPaise,
    required this.weeklyDiscountPct,
    required this.rentalDays,
    required this.advanceNoticeDays,
    required this.photos,
    required this.maxBlockedRanges,
  });

  factory MarketRules.fromJson(Map<String, dynamic> json) {
    Range r(String key) => Range.fromJson(json[key] as Map<String, dynamic>);
    return MarketRules(
      commissionBps: (json['commissionBps'] as num).toInt(),
      pricePerDayPaise: r('pricePerDayPaise'),
      depositPaise: r('depositPaise'),
      weeklyDiscountPct: r('weeklyDiscountPct'),
      rentalDays: r('rentalDays'),
      advanceNoticeDays: r('advanceNoticeDays'),
      photos: r('photos'),
      maxBlockedRanges: (json['maxBlockedRanges'] as num).toInt(),
    );
  }

  final int commissionBps;
  final Range pricePerDayPaise;
  final Range depositPaise;
  final Range weeklyDiscountPct;
  final Range rentalDays;
  final Range advanceNoticeDays;
  final Range photos;
  final int maxBlockedRanges;

  /// What the lender keeps from [rentPaise] after the platform commission.
  int lenderEarnings(int rentPaise) =>
      rentPaise - (rentPaise * commissionBps / 10000).round();
}

enum ItemCondition {
  newItem('NEW', 'New'),
  likeNew('LIKE_NEW', 'Like new'),
  good('GOOD', 'Good'),
  fair('FAIR', 'Fair');

  const ItemCondition(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static ItemCondition fromApi(String v) =>
      values.firstWhere((c) => c.apiValue == v, orElse: () => good);
}

enum ListingStatus {
  draft('DRAFT', 'Draft'),
  pending('PENDING', 'In review'),
  live('LIVE', 'Live'),
  paused('PAUSED', 'Paused'),
  rejected('REJECTED', 'Needs changes'),
  removed('REMOVED', 'Removed'),
  deleted('DELETED', 'Deleted');

  const ListingStatus(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static ListingStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => draft);

  /// The lender can still edit it.
  bool get editable => this != removed && this != deleted;
}

enum RequiredDocType {
  governmentId(
    'GOVERNMENT_ID',
    'Government ID',
    'Aadhaar (masked), PAN, driving licence, passport or voter ID',
  ),
  collegeOrEmployeeId(
    'COLLEGE_OR_EMPLOYEE_ID',
    'College or employee ID',
    'A current student or work ID card',
  ),
  addressProof(
    'ADDRESS_PROOF',
    'Address proof',
    'Utility bill, rent agreement or bank statement',
  ),
  other('OTHER', 'Something else', 'Describe what you need');

  const RequiredDocType(this.apiValue, this.label, this.hint);
  final String apiValue;
  final String label;
  final String hint;

  static RequiredDocType fromApi(String v) =>
      values.firstWhere((t) => t.apiValue == v, orElse: () => other);
}

class RequiredDoc {
  const RequiredDoc(this.type, [this.note]);

  factory RequiredDoc.fromJson(Map<String, dynamic> json) => RequiredDoc(
    RequiredDocType.fromApi(json['docType'] as String),
    json['note'] as String?,
  );

  final RequiredDocType type;

  /// Required for [RequiredDocType.other].
  final String? note;

  Map<String, dynamic> toJson() => {
    'docType': type.apiValue,
    if (note != null && note!.trim().isNotEmpty) 'note': note!.trim(),
  };

  String get title =>
      type == RequiredDocType.other && note != null ? note! : type.label;
}

/// Dates the item can't be rented, inclusive.
class BlockedRange {
  const BlockedRange(this.start, this.end);

  factory BlockedRange.fromJson(Map<String, dynamic> json) => BlockedRange(
    DateTime.parse(json['startsOn'] as String),
    DateTime.parse(json['endsOn'] as String),
  );

  final DateTime start;
  final DateTime end;

  Map<String, dynamic> toJson() => {
    'startsOn': isoDate(start),
    'endsOn': isoDate(end),
  };

  @override
  bool operator ==(Object other) =>
      other is BlockedRange && other.start == start && other.end == end;

  @override
  int get hashCode => Object.hash(start, end);
}

class ListingPhoto {
  const ListingPhoto({
    required this.id,
    required this.url,
    required this.thumbUrl,
  });

  factory ListingPhoto.fromJson(Map<String, dynamic> json) => ListingPhoto(
    id: json['id'] as String,
    url: json['url'] as String,
    thumbUrl: json['thumbUrl'] as String,
  );

  final String id;
  final String url;
  final String thumbUrl;
}

/// The lender's own listing (`/v1/me/listings`), exact pin and address included.
class MyListing {
  const MyListing({
    required this.id,
    required this.category,
    required this.title,
    required this.description,
    required this.condition,
    required this.pricePerDayPaise,
    required this.weeklyDiscountPct,
    required this.depositPaise,
    required this.minDays,
    required this.maxDays,
    required this.advanceNoticeDays,
    required this.status,
    required this.photos,
    required this.requiredDocs,
    required this.blocks,
    this.brand,
    this.size,
    this.lat,
    this.lng,
    this.areaLabel,
    this.exactAddress,
    this.rejectionReason,
  });

  factory MyListing.fromJson(Map<String, dynamic> json) => MyListing(
    id: json['id'] as String,
    category: Category.fromJson(json['category'] as Map<String, dynamic>),
    title: json['title'] as String,
    description: json['description'] as String,
    condition: ItemCondition.fromApi(json['condition'] as String),
    brand: json['brand'] as String?,
    size: json['size'] as String?,
    pricePerDayPaise: (json['pricePerDayPaise'] as num).toInt(),
    weeklyDiscountPct: (json['weeklyDiscountPct'] as num).toInt(),
    depositPaise: (json['depositPaise'] as num).toInt(),
    minDays: (json['minDays'] as num).toInt(),
    maxDays: (json['maxDays'] as num).toInt(),
    advanceNoticeDays: (json['advanceNoticeDays'] as num).toInt(),
    lat: (json['lat'] as num?)?.toDouble(),
    lng: (json['lng'] as num?)?.toDouble(),
    areaLabel: json['areaLabel'] as String?,
    exactAddress: json['exactAddress'] as String?,
    status: ListingStatus.fromApi(json['status'] as String),
    rejectionReason: json['rejectionReason'] as String?,
    photos: [
      for (final p in json['photos'] as List)
        ListingPhoto.fromJson(p as Map<String, dynamic>),
    ],
    requiredDocs: [
      for (final d in json['requiredDocs'] as List)
        RequiredDoc.fromJson(d as Map<String, dynamic>),
    ],
    blocks: [
      for (final b in json['blocks'] as List)
        BlockedRange.fromJson(b as Map<String, dynamic>),
    ],
  );

  final String id;
  final Category category;
  final String title;
  final String description;
  final ItemCondition condition;
  final String? brand;
  final String? size;
  final int pricePerDayPaise;
  final int weeklyDiscountPct;
  final int depositPaise;
  final int minDays;
  final int maxDays;
  final int advanceNoticeDays;
  final double? lat;
  final double? lng;
  final String? areaLabel;
  final String? exactAddress;
  final ListingStatus status;
  final String? rejectionReason;
  final List<ListingPhoto> photos;
  final List<RequiredDoc> requiredDocs;
  final List<BlockedRange> blocks;

  ListingPhoto? get cover => photos.firstOrNull;
}

String isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// "₹1,50,000" from paise (Indian digit grouping); "₹150.50" keeps paise.
String formatRupees(int paise) {
  final rupees = paise ~/ 100;
  final rest = paise % 100;
  final digits = rupees.toString();
  String grouped;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    final last3 = digits.substring(digits.length - 3);
    var head = digits.substring(0, digits.length - 3);
    final parts = <String>[];
    while (head.length > 2) {
      parts.insert(0, head.substring(head.length - 2));
      head = head.substring(0, head.length - 2);
    }
    if (head.isNotEmpty) parts.insert(0, head);
    grouped = '${parts.join(',')},$last3';
  }
  return rest == 0
      ? '₹$grouped'
      : '₹$grouped.${rest.toString().padLeft(2, '0')}';
}

/// "< 1 km", "2.5 km", "12 km". Distances come rounded to 0.5 km.
String formatDistance(double km) {
  if (km < 1) return '< 1 km';
  return km == km.roundToDouble()
      ? '${km.toInt()} km'
      : '${km.toStringAsFixed(1)} km';
}

/// Rounds like the API does (0.5 km steps; under 1 km becomes 0.5), so an
/// approximate pin never gives away more than a search result would.
double roundDistanceKm(double meters) {
  if (meters < 1000) return 0.5;
  return (meters / 500).round() / 2;
}
