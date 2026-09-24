/// Search, home feed, public listings and quotes, as the API returns them.
/// Money is in paise throughout; format it with `formatRupees`.
library;

import '../../listings/data/models.dart';

/// A lender as a card shows them.
class CardLender {
  const CardLender({
    required this.id,
    required this.idVerified,
    this.name,
    this.avatarUrl,
  });

  factory CardLender.fromJson(Map<String, dynamic> json) => CardLender(
    id: json['id'] as String,
    name: json['name'] as String?,
    avatarUrl: json['avatarUrl'] as String?,
    idVerified: json['idVerified'] as bool,
  );

  final String id;
  final String? name;
  final String? avatarUrl;
  final bool idVerified;
}

/// One result in search, the home feed or the wishlist.
class ListingCard {
  const ListingCard({
    required this.id,
    required this.title,
    required this.category,
    required this.pricePerDayPaise,
    required this.weeklyDiscountPct,
    required this.depositPaise,
    required this.lender,
    required this.saved,
    required this.available,
    this.thumbUrl,
    this.areaLabel,
    this.distanceKm,
    this.rentPaise,
    this.days,
  });

  factory ListingCard.fromJson(Map<String, dynamic> json) => ListingCard(
    id: json['id'] as String,
    title: json['title'] as String,
    category: Category.fromJson(json['category'] as Map<String, dynamic>),
    thumbUrl: json['thumbUrl'] as String?,
    pricePerDayPaise: (json['pricePerDayPaise'] as num).toInt(),
    weeklyDiscountPct: (json['weeklyDiscountPct'] as num).toInt(),
    depositPaise: (json['depositPaise'] as num).toInt(),
    areaLabel: json['areaLabel'] as String?,
    distanceKm: (json['distanceKm'] as num?)?.toDouble(),
    lender: CardLender.fromJson(json['lender'] as Map<String, dynamic>),
    saved: json['saved'] as bool,
    available: json['available'] as bool,
    rentPaise: (json['rentPaise'] as num?)?.toInt(),
    days: (json['days'] as num?)?.toInt(),
  );

  final String id;
  final String title;
  final Category category;
  final String? thumbUrl;
  final int pricePerDayPaise;
  final int weeklyDiscountPct;
  final int depositPaise;
  final String? areaLabel;

  /// Rounded to 0.5 km by the API; 0.5 means "under 1 km".
  final double? distanceKm;
  final CardLender lender;
  final bool saved;

  /// False for wishlist items that were taken down.
  final bool available;

  /// Rent for the searched dates, when dates were given.
  final int? rentPaise;
  final int? days;

  /// "Kothrud, Pune · 2.5 km".
  String get placeLine => [
    if (areaLabel != null && areaLabel!.isNotEmpty) areaLabel!,
    if (distanceKm != null) formatDistance(distanceKm!),
  ].join(' · ');
}

enum SearchSort {
  distance('distance', 'Nearest first'),
  relevance('relevance', 'Best match'),
  priceAsc('price_asc', 'Price: low to high'),
  priceDesc('price_desc', 'Price: high to low'),
  newest('newest', 'Newest');

  const SearchSort(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static SearchSort? fromApi(String? v) =>
      values.where((s) => s.apiValue == v).firstOrNull;
}

class SearchPage {
  const SearchPage({required this.items, required this.sort, this.nextCursor});

  factory SearchPage.fromJson(Map<String, dynamic> json) => SearchPage(
    items: [
      for (final c in json['items'] as List)
        ListingCard.fromJson(c as Map<String, dynamic>),
    ],
    nextCursor: json['nextCursor'] as String?,
    sort: SearchSort.fromApi(json['sort'] as String?) ?? SearchSort.newest,
  );

  final List<ListingCard> items;
  final String? nextCursor;

  /// The sort the API applied (its default when none was asked for).
  final SearchSort sort;
}

class HomeFeed {
  const HomeFeed({
    required this.categories,
    required this.nearYou,
    required this.popular,
    required this.newest,
  });

  factory HomeFeed.fromJson(Map<String, dynamic> json) {
    List<ListingCard> cards(String key) => [
      for (final c in json[key] as List)
        ListingCard.fromJson(c as Map<String, dynamic>),
    ];
    return HomeFeed(
      categories: [
        for (final c in json['categories'] as List)
          Category.fromJson(c as Map<String, dynamic>),
      ],
      nearYou: cards('nearYou'),
      popular: cards('popularThisWeek'),
      newest: cards('newest'),
    );
  }

  final List<Category> categories;
  final List<ListingCard> nearYou;
  final List<ListingCard> popular;
  final List<ListingCard> newest;
}

/// Everything a borrower can filter on. Immutable; change it with [copyWith].
class SearchFilters {
  const SearchFilters({
    this.query = '',
    this.categoryId,
    this.minPricePaise,
    this.maxPricePaise,
    this.conditions = const {},
    this.verifiedOnly = false,
    this.sort,
    this.dates,
  });

  final String query;
  final String? categoryId;
  final int? minPricePaise;
  final int? maxPricePaise;
  final Set<ItemCondition> conditions;
  final bool verifiedOnly;

  /// Null lets the API choose (nearest first with an area, best match with keywords).
  final SearchSort? sort;
  final BlockedRange? dates;

  /// How many filters from the sheet are on (query, sort and dates aside).
  int get activeCount =>
      (categoryId != null ? 1 : 0) +
      (minPricePaise != null || maxPricePaise != null ? 1 : 0) +
      (conditions.isNotEmpty ? 1 : 0) +
      (verifiedOnly ? 1 : 0);

  SearchFilters copyWith({
    String? query,
    String? Function()? categoryId,
    int? Function()? minPricePaise,
    int? Function()? maxPricePaise,
    Set<ItemCondition>? conditions,
    bool? verifiedOnly,
    SearchSort? Function()? sort,
    BlockedRange? Function()? dates,
  }) => SearchFilters(
    query: query ?? this.query,
    categoryId: categoryId != null ? categoryId() : this.categoryId,
    minPricePaise: minPricePaise != null ? minPricePaise() : this.minPricePaise,
    maxPricePaise: maxPricePaise != null ? maxPricePaise() : this.maxPricePaise,
    conditions: conditions ?? this.conditions,
    verifiedOnly: verifiedOnly ?? this.verifiedOnly,
    sort: sort != null ? sort() : this.sort,
    dates: dates != null ? dates() : this.dates,
  );

  /// Query parameters for `GET /v1/search`, without the area.
  Map<String, dynamic> toQuery() => {
    if (query.trim().isNotEmpty) 'q': query.trim(),
    'categoryId': ?categoryId,
    'minPricePaise': ?minPricePaise,
    'maxPricePaise': ?maxPricePaise,
    if (conditions.isNotEmpty)
      'condition': conditions.map((c) => c.apiValue).join(','),
    if (verifiedOnly) 'verifiedLendersOnly': 'true',
    'sort': ?sort?.apiValue,
    if (dates != null) ...{
      'startDate': isoDate(dates!.start),
      'endDate': isoDate(dates!.end),
    },
  };
}

/// A lender on a listing page.
class LenderSummary {
  const LenderSummary({
    required this.id,
    required this.phoneVerified,
    required this.emailVerified,
    required this.idVerified,
    required this.memberSince,
    this.name,
    this.avatarUrl,
    this.city,
  });

  factory LenderSummary.fromJson(Map<String, dynamic> json) => LenderSummary(
    id: json['id'] as String,
    name: json['name'] as String?,
    avatarUrl: json['avatarUrl'] as String?,
    city: json['city'] as String?,
    phoneVerified: json['phoneVerified'] as bool,
    emailVerified: json['emailVerified'] as bool,
    idVerified: json['idVerified'] as bool,
    memberSince: DateTime.parse(json['memberSince'] as String),
  );

  final String id;
  final String? name;
  final String? avatarUrl;
  final String? city;
  final bool phoneVerified;
  final bool emailVerified;
  final bool idVerified;
  final DateTime memberSince;
}

/// `GET /v1/listings/:id`: what anyone can see. The pickup point is
/// approximate (~1 km); the exact address comes with a confirmed booking.
class PublicListing {
  const PublicListing({
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
    required this.photos,
    required this.requiredDocs,
    required this.blocks,
    required this.approxLat,
    required this.approxLng,
    required this.lender,
    required this.saved,
    required this.favoriteCount,
    this.brand,
    this.size,
    this.areaLabel,
  });

  factory PublicListing.fromJson(Map<String, dynamic> json) => PublicListing(
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
    areaLabel: json['areaLabel'] as String?,
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
    approxLat: (json['approxLat'] as num).toDouble(),
    approxLng: (json['approxLng'] as num).toDouble(),
    lender: LenderSummary.fromJson(json['lender'] as Map<String, dynamic>),
    saved: json['saved'] as bool,
    favoriteCount: (json['favoriteCount'] as num).toInt(),
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
  final String? areaLabel;
  final List<ListingPhoto> photos;
  final List<RequiredDoc> requiredDocs;
  final List<BlockedRange> blocks;
  final double approxLat;
  final double approxLng;
  final LenderSummary lender;
  final bool saved;
  final int favoriteCount;
}

enum UnavailableReason {
  blocked('BLOCKED', 'The lender has blocked some of these dates.'),
  tooShort('TOO_SHORT', 'That’s shorter than the minimum rental.'),
  tooLong('TOO_LONG', 'That’s longer than the maximum rental.'),
  notEnoughNotice(
    'NOT_ENOUGH_NOTICE',
    'The lender needs more notice before pickup.',
  );

  const UnavailableReason(this.apiValue, this.message);
  final String apiValue;
  final String message;

  static UnavailableReason? fromApi(String? v) =>
      values.where((r) => r.apiValue == v).firstOrNull;
}

/// `GET /v1/listings/:id/quote`: the price for a set of dates.
class Quote {
  const Quote({
    required this.days,
    required this.pricePerDayPaise,
    required this.rentBeforeDiscountPaise,
    required this.weeklyDiscountPaise,
    required this.rentPaise,
    required this.feePaise,
    required this.depositPaise,
    required this.totalPaise,
    required this.available,
    this.unavailableReason,
  });

  factory Quote.fromJson(Map<String, dynamic> json) {
    int n(String key) => (json[key] as num).toInt();
    return Quote(
      days: n('days'),
      pricePerDayPaise: n('pricePerDayPaise'),
      rentBeforeDiscountPaise: n('rentBeforeDiscountPaise'),
      weeklyDiscountPaise: n('weeklyDiscountPaise'),
      rentPaise: n('rentPaise'),
      feePaise: n('feePaise'),
      depositPaise: n('depositPaise'),
      totalPaise: n('totalPaise'),
      available: json['available'] as bool,
      unavailableReason: UnavailableReason.fromApi(
        json['unavailableReason'] as String?,
      ),
    );
  }

  final int days;
  final int pricePerDayPaise;
  final int rentBeforeDiscountPaise;
  final int weeklyDiscountPaise;
  final int rentPaise;
  final int feePaise;
  final int depositPaise;
  final int totalPaise;
  final bool available;
  final UnavailableReason? unavailableReason;
}
