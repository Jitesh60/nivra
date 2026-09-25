import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/location/location_service.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';
import 'package:sajha/features/listings/presentation/listing_detail_view.dart';

import '../helpers/pump_app.dart';

void main() {
  Future<TestHarness> signedIn(
    WidgetTester tester, {
    bool emailVerified = true,
  }) async {
    final h = TestHarness();
    h.storage.refreshToken = h.api.seedSession(emailVerified: emailVerified);
    await h.start(tester);
    return h;
  }

  /// The top of the stack (pushed routes included).
  String location(TestHarness h) => h.container
      .read(routerProvider)
      .routerDelegate
      .currentConfiguration
      .last
      .matchedLocation;

  Future<void> next(WidgetTester tester) => tapKey(tester, 'wizard-next');

  String stepLabel(WidgetTester tester) =>
      tester.widget<Text>(find.byKey(const ValueKey('wizard-step'))).data!;

  /// Fills every step of the wizard up to the preview.
  Future<void> fillWizard(
    WidgetTester tester, {
    String title = 'Quechua 2-person tent',
  }) async {
    // 1. Photos (the fake picker returns two).
    await tapKey(tester, 'add-photos');
    expect(find.text('2 of 8 photos'), findsOneWidget);
    await next(tester);

    // 2. Details.
    await tapKey(tester, 'category-trekking-outdoor');
    await enterText(tester, 'listing-title', title);
    await enterText(
      tester,
      'listing-description',
      'Waterproof tent, used on three treks. Pegs and bag included.',
    );
    await tapKey(tester, 'condition-GOOD');
    await next(tester);

    // 3. Price, with the earnings preview from /config.
    await enterText(tester, 'listing-price', '150');
    expect(
      find.text('You earn ₹135/day after Nivra’s 10% fee.'),
      findsOneWidget,
    );
    await enterText(tester, 'listing-deposit', '1000');
    await next(tester);

    // 4. Availability.
    await tapKey(tester, 'max-days-minus');
    expect(find.text('29 days'), findsOneWidget);
    await next(tester);

    // 5. Pickup point from GPS, plus the public area and private address.
    expect(find.text('Pin not set yet'), findsOneWidget);
    await tapKey(tester, 'use-my-location');
    expect(find.text('Pin set'), findsOneWidget);
    await enterText(tester, 'area-label', 'Kothrud, Pune');
    await enterText(tester, 'exact-address', 'Flat 4B, Sai Residency');
    await next(tester);

    // 6. Documents.
    await tapKey(tester, 'doc-GOVERNMENT_ID');
    await next(tester);
    expect(stepLabel(tester), 'Step 7 of 7 · Preview');
  }

  testWidgets('first listing: the wizard publishes it for review', (
    tester,
  ) async {
    final h = await signedIn(tester);
    await tapKey(tester, 'list-item');
    expect(location(h), Routes.newListing);

    // Each step checks its fields before moving on.
    await next(tester);
    expect(find.textContaining('Add at least one photo.'), findsOneWidget);
    expect(stepLabel(tester), 'Step 1 of 7 · Photos');

    await fillWizard(tester);
    // The preview is the borrower's view, below the photo gallery.
    await tester.scrollUntilVisible(
      find.text('Kothrud, Pune'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(ListingDetailView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('Quechua 2-person tent'), findsOneWidget);
    expect(find.text('₹1,000 deposit'), findsNothing);
    expect(find.text('Refundable deposit ₹1,000'), findsOneWidget);
    expect(find.text('Documents to share'), findsOneWidget);
    expect(find.text('Government ID'), findsOneWidget);

    await tapKey(tester, 'wizard-next'); // Publish
    await settle(tester, 20);
    expect(find.text('Sent for review'), findsOneWidget);

    final l = h.api.listings.values.single;
    expect(l.status, 'PENDING');
    expect(l.photos, hasLength(2));
    expect(l.fields, containsPair('pricePerDayPaise', 15000));
    expect(l.fields, containsPair('depositPaise', 100000));
    expect(l.fields, containsPair('maxDays', 29));
    expect(l.fields, containsPair('lat', 18.5074));
    expect(l.fields, containsPair('exactAddress', 'Flat 4B, Sai Residency'));
    expect(l.requiredDocs, [
      {'docType': 'GOVERNMENT_ID'},
    ]);
    // Photos go to storage, never with the Bearer token.
    expect(h.api.storagePuts, hasLength(2));

    await tapText(tester, 'See my listings');
    expect(location(h), Routes.myListings);
    expect(find.text('In review'), findsOneWidget);
    expect(find.text('We’re checking your first listing.'), findsOneWidget);
  });

  testWidgets('after an approval, the next listing goes live at once', (
    tester,
  ) async {
    final h = await signedIn(tester);
    final first = h.api.seedListing(status: 'PENDING');
    h.api.approveListing(first.id);

    h.container.read(routerProvider).push(Routes.newListing);
    await settle(tester);
    await fillWizard(tester, title: 'Canon EOS 1500D kit');
    await tapKey(tester, 'wizard-next');
    await settle(tester, 20);
    expect(find.text('Your listing is live'), findsOneWidget);
    expect(
      h.api.listings.values
          .firstWhere((l) => l.title == 'Canon EOS 1500D kit')
          .status,
      'LIVE',
    );
  });

  testWidgets('pause, resume and delete from My listings', (tester) async {
    final h = await signedIn(tester);
    final l = h.api.seedListing();
    h.container.read(routerProvider).push(Routes.myListings);
    await settle(tester);
    expect(find.text('Live'), findsOneWidget);
    expect(find.text('₹150/day'), findsOneWidget);

    await tapKey(tester, 'my-listing-${l.id}');
    await tapKey(tester, 'action-pause');
    expect(l.status, 'PAUSED');
    expect(find.text('Paused'), findsOneWidget);

    await tapKey(tester, 'my-listing-${l.id}');
    await tapKey(tester, 'action-resume');
    expect(l.status, 'LIVE');

    await tapKey(tester, 'my-listing-${l.id}');
    await tapKey(tester, 'action-delete');
    await tapText(tester, 'Cancel');
    expect(l.status, 'LIVE');
    await tapKey(tester, 'my-listing-${l.id}');
    await tapKey(tester, 'action-delete');
    await tapText(tester, 'Delete');
    expect(l.status, 'DELETED');
    expect(find.textContaining('Nothing listed yet'), findsOneWidget);
  });

  testWidgets('a rejected listing shows the reason; editing resubmits it', (
    tester,
  ) async {
    final h = await signedIn(tester);
    final l = h.api.seedListing(
      status: 'REJECTED',
      rejectionReason: 'Photos are blurry',
    );
    h.container.read(routerProvider).push(Routes.myListings);
    await settle(tester);
    expect(find.text('Needs changes'), findsOneWidget);
    expect(find.text('Edit it to fix: Photos are blurry'), findsOneWidget);

    await tapKey(tester, 'my-listing-${l.id}');
    await tapKey(tester, 'action-edit');
    expect(find.text('Reviewer’s note: Photos are blurry'), findsOneWidget);

    // Replace the photo: add new ones, then remove the old one.
    await tapKey(tester, 'add-photos');
    await tapKey(tester, 'photo-0');
    await tapText(tester, 'Remove');
    expect(find.text('2 of 8 photos'), findsOneWidget);
    for (var i = 0; i < 6; i++) {
      await next(tester);
    }
    expect(find.text('Publish'), findsOneWidget);
    await tapKey(tester, 'wizard-next');
    await settle(tester, 20);
    expect(find.text('Sent for review'), findsOneWidget);
    expect(l.status, 'PENDING');
    expect(l.photos, hasLength(2));
    expect(l.photos.first['id'], isNot('photo-1'));

    await tapText(tester, 'See my listings');
    expect(find.text('In review'), findsOneWidget);
  });

  testWidgets('editing a live listing saves without re-review', (tester) async {
    final h = await signedIn(tester);
    final l = h.api.seedListing();
    h.container.read(routerProvider).push(Routes.myListings);
    await settle(tester);
    await tapKey(tester, 'my-listing-${l.id}');
    await tapKey(tester, 'action-edit');
    await next(tester);
    await enterText(
      tester,
      'listing-title',
      'Quechua tent, now with footprint',
    );
    for (var i = 0; i < 5; i++) {
      await next(tester);
    }
    expect(find.text('Save changes'), findsOneWidget);
    await tapKey(tester, 'wizard-next');
    await settle(tester, 20);
    expect(find.text('Changes saved'), findsOneWidget);
    expect(l.status, 'LIVE');
    expect(l.title, 'Quechua tent, now with footprint');
  });

  testWidgets('pricing and location rules are enforced before moving on', (
    tester,
  ) async {
    final h = await signedIn(tester);
    h.container.read(routerProvider).push(Routes.newListing);
    await settle(tester);
    await tapKey(tester, 'add-photos');
    await next(tester);
    await tapKey(tester, 'category-trekking-outdoor');
    await enterText(tester, 'listing-title', 'Tent');
    await next(tester);
    expect(
      find.textContaining('Give it a title (5+ characters).'),
      findsOneWidget,
    );
    await enterText(tester, 'listing-title', 'Trekking tent');
    await enterText(
      tester,
      'listing-description',
      'A tent for two people with pegs.',
    );
    await tapKey(tester, 'condition-LIKE_NEW');
    await next(tester);

    await enterText(tester, 'listing-price', '5');
    await enterText(tester, 'listing-deposit', '60000');
    await next(tester);
    expect(
      find.textContaining('Price per day must be ₹10–₹10,000.'),
      findsOneWidget,
    );
    expect(find.textContaining('Deposit must be ₹0–₹50,000.'), findsOneWidget);
    await enterText(tester, 'listing-price', '100');
    await enterText(tester, 'listing-deposit', '0');
    await next(tester);
    await next(tester);

    // Location denied: a hint, and the step still needs a pin.
    h.location.next = const LocationResult.failed(LocationProblem.denied);
    await tapKey(tester, 'use-my-location');
    expect(find.textContaining('Location permission is off'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5)); // let the snackbar go
    await settle(tester);
    await next(tester);
    expect(
      find.textContaining('Set the pickup point on the map.'),
      findsOneWidget,
    );
  });

  testWidgets('listing needs a verified email', (tester) async {
    final h = await signedIn(tester, emailVerified: false);
    h.container.read(routerProvider).go(Routes.home);
    await settle(tester);
    await tapKey(tester, 'list-item');
    expect(find.text('Verify your email first'), findsOneWidget);
    await tapText(tester, 'Verify email');
    expect(location(h), Routes.setupEmail);
  });
}
