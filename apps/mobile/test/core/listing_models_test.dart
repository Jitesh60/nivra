import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/features/listings/application/listing_draft.dart';
import 'package:sajha/features/listings/data/models.dart';

import '../helpers/fake_api.dart';

void main() {
  final rules = MarketRules.fromJson(FakeSajhaApi.rules);

  test('formats rupees with Indian digit grouping', () {
    expect(formatRupees(0), '₹0');
    expect(formatRupees(15000), '₹150');
    expect(formatRupees(100000), '₹1,000');
    expect(formatRupees(15000000), '₹1,50,000');
    expect(formatRupees(1234567890), '₹1,23,45,678.90');
    expect(formatRupees(15050), '₹150.50');
  });

  test('lender earnings take off the commission from /config', () {
    expect(rules.commissionBps, 1000);
    expect(rules.lenderEarnings(15000), 13500);
    expect(rules.lenderEarnings(999), 899);
  });

  test('each wizard step reports what is missing', () {
    const empty = ListingDraft();
    expect(validateStep(ListingStep.photos, empty, rules), [
      'Add at least one photo.',
    ]);
    expect(validateStep(ListingStep.details, empty, rules), hasLength(4));
    expect(validateStep(ListingStep.location, empty, rules), hasLength(2));

    final ready = empty.copyWith(
      photos: [LocalPhoto(Uint8List(4))],
      categoryId: 'cat-trek',
      title: 'Trekking tent',
      description: 'Two-person tent with pegs and a bag.',
      condition: ItemCondition.good,
      pricePerDay: () => 150,
      deposit: () => 1000,
      lat: 18.5,
      lng: 73.8,
      areaLabel: 'Kothrud, Pune',
    );
    expect(validateStep(ListingStep.preview, ready, rules), isEmpty);
    expect(
      validateStep(
        ListingStep.availability,
        ready.copyWith(minDays: 10, maxDays: 5),
        rules,
      ),
      ['Minimum days can’t be more than maximum days.'],
    );
    expect(
      validateStep(
        ListingStep.pricing,
        ready.copyWith(pricePerDay: () => 5),
        rules,
      ),
      hasLength(1),
    );
    expect(
      validateStep(
        ListingStep.documents,
        ready.copyWith(
          requiredDocs: [const RequiredDoc(RequiredDocType.other)],
        ),
        rules,
      ),
      hasLength(1),
    );

    // Paise on the wire; optional text left out of a new listing.
    expect(ready.toFields(), {
      'categoryId': 'cat-trek',
      'title': 'Trekking tent',
      'description': 'Two-person tent with pegs and a bag.',
      'condition': 'GOOD',
      'pricePerDayPaise': 15000,
      'weeklyDiscountPct': 0,
      'depositPaise': 100000,
      'minDays': 1,
      'maxDays': 30,
      'advanceNoticeDays': 1,
      'lat': 18.5,
      'lng': 73.8,
      'areaLabel': 'Kothrud, Pune',
    });
  });

  test('parses a listing from the API', () {
    final l = MyListing.fromJson({
      'id': 'l1',
      'category': FakeSajhaApi.categories.first,
      'title': 'Tent',
      'description': 'A tent',
      'condition': 'LIKE_NEW',
      'brand': null,
      'size': null,
      'pricePerDayPaise': 15000,
      'weeklyDiscountPct': 10,
      'depositPaise': 100000,
      'minDays': 2,
      'maxDays': 14,
      'advanceNoticeDays': 1,
      'lat': 18.5,
      'lng': 73.8,
      'areaLabel': 'Kothrud',
      'exactAddress': 'Flat 4B',
      'status': 'REJECTED',
      'rejectionReason': 'Blurry',
      'photos': [
        {'id': 'p1', 'url': 'u', 'thumbUrl': 't', 'width': 1, 'height': 1},
      ],
      'requiredDocs': [
        {'docType': 'OTHER', 'note': 'Trek permit'},
      ],
      'blocks': [
        {'startsOn': '2026-10-02', 'endsOn': '2026-10-05'},
      ],
    });
    expect(l.condition, ItemCondition.likeNew);
    expect(l.status, ListingStatus.rejected);
    expect(l.status.editable, isTrue);
    expect(l.requiredDocs.single.title, 'Trek permit');
    expect(l.blocks.single.toJson(), {
      'startsOn': '2026-10-02',
      'endsOn': '2026-10-05',
    });
    final draft = ListingDraft.fromListing(l);
    expect(draft.pricePerDay, 150);
    expect(draft.willPublish, isTrue); // rejected → edit → resubmit
    expect(draft.toFields()['exactAddress'], 'Flat 4B');
  });
}
