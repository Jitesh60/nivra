import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/features/discovery/application/search_area.dart';
import 'package:sajha/features/discovery/data/models.dart';
import 'package:sajha/features/listings/data/models.dart';

void main() {
  test('distances read like the API rounds them', () {
    expect(formatDistance(0.5), '< 1 km');
    expect(formatDistance(1), '1 km');
    expect(formatDistance(2.5), '2.5 km');
    expect(roundDistanceKm(120), 0.5);
    expect(roundDistanceKm(1240), 1.0);
    expect(roundDistanceKm(1260), 1.5);
    expect(roundDistanceKm(9800), 10.0);
  });

  test('filters become the search query string', () {
    const empty = SearchFilters();
    expect(empty.toQuery(), isEmpty);
    expect(empty.activeCount, 0);

    final f = empty.copyWith(
      query: '  tent ',
      categoryId: () => 'cat-trek',
      minPricePaise: () => 10000,
      conditions: {ItemCondition.newItem, ItemCondition.likeNew},
      verifiedOnly: true,
      sort: () => SearchSort.priceAsc,
      dates: () => BlockedRange(DateTime(2026, 10, 2), DateTime(2026, 10, 4)),
    );
    expect(f.toQuery(), {
      'q': 'tent',
      'categoryId': 'cat-trek',
      'minPricePaise': 10000,
      'condition': 'NEW,LIKE_NEW',
      'verifiedLendersOnly': 'true',
      'sort': 'price_asc',
      'startDate': '2026-10-02',
      'endDate': '2026-10-04',
    });
    expect(f.activeCount, 4);
    // Clearing is explicit, so null can mean "unchanged".
    expect(f.copyWith(categoryId: () => null).categoryId, isNull);
    expect(f.copyWith().categoryId, 'cat-trek');
  });

  test('the search area keeps its radius within 1–25 km', () {
    const area = SearchArea(lat: 18.5, lng: 73.8, label: 'Current location');
    expect(area.radiusKm, 5);
    expect(area.withRadius(40).radiusKm, 25);
    expect(area.withRadius(0).radiusKm, 1);
    expect(area.summary, 'Current location · 5 km');
    final back = SearchArea.fromJson({...area.toJson(), 'radiusKm': 99});
    expect(back.radiusKm, 25);
    expect(back.label, 'Current location');
  });

  test('cards and quotes parse the API shapes', () {
    final card = ListingCard.fromJson({
      'id': 'l1',
      'title': 'Tent',
      'category': {
        'id': 'c',
        'name': 'Trekking',
        'slug': 'trekking',
        'icon': 'hiking',
      },
      'thumbUrl': null,
      'pricePerDayPaise': 15000,
      'weeklyDiscountPct': 10,
      'depositPaise': 100000,
      'areaLabel': 'Kothrud, Pune',
      'distanceKm': 0.5,
      'lender': {
        'id': 'u',
        'name': null,
        'avatarUrl': null,
        'idVerified': true,
      },
      'saved': false,
      'available': true,
      'rentPaise': null,
      'days': null,
    });
    expect(card.placeLine, 'Kothrud, Pune · < 1 km');
    expect(card.lender.idVerified, isTrue);

    final quote = Quote.fromJson({
      'days': 3,
      'pricePerDayPaise': 15000,
      'rentBeforeDiscountPaise': 45000,
      'weeklyDiscountPaise': 0,
      'rentPaise': 45000,
      'feePaise': 0,
      'depositPaise': 100000,
      'totalPaise': 145000,
      'available': false,
      'unavailableReason': 'NOT_ENOUGH_NOTICE',
    });
    expect(quote.unavailableReason, UnavailableReason.notEnoughNotice);
    expect(SearchSort.fromApi('nope'), isNull);
  });
}
