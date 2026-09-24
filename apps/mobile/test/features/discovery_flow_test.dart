import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/location/location_service.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';
import 'package:sajha/features/listings/data/models.dart';

import '../helpers/fake_api.dart';
import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  // A phone-sized screen (360×800), so pages lay out as they would on a device.
  setUp(() {
    final view =
        TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view
      ..physicalSize = const Size(1080, 2400)
      ..devicePixelRatio = 3;
    addTearDown(view.reset);
  });

  /// The page on top, query included.
  String location(TestHarness h) =>
      h.container.read(routerProvider).state.uri.toString();

  DateTime day(int fromToday) {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day + fromToday);
  }

  /// Two lenders around Kothrud, Pune, one in Bengaluru.
  ({String tent, String camera, String far, String lender}) seedMarket(
    FakeSajhaApi api,
  ) {
    final lender = api.seedLender(idVerified: true);
    final other = api.seedLender(name: 'Vikram Rao', phone: '+919811111111');
    final tent = api.seedListing(
      lenderId: lender,
      title: 'Quechua trekking tent',
      lat: 18.5080,
      lng: 73.8080, // ~100 m away
    );
    final camera = api.seedListing(
      lenderId: other,
      title: 'Canon EOS 200D camera',
      categoryId: 'cat-camera',
      description: 'Entry DSLR with the kit lens and two batteries.',
      condition: 'LIKE_NEW',
      pricePerDayPaise: 50000,
      lat: 18.5300,
      lng: 73.8300, // ~3 km away
      areaLabel: 'Shivajinagar, Pune',
    );
    final far = api.seedListing(
      lenderId: other,
      title: 'Bengaluru trekking tent',
      lat: 12.9716,
      lng: 77.5946,
      areaLabel: 'Indiranagar, Bengaluru',
    );
    return (tent: tent.id, camera: camera.id, far: far.id, lender: lender);
  }

  /// A returning guest (onboarding seen, not signed in).
  Future<TestHarness> guest(WidgetTester tester, [FakeSajhaApi? api]) async {
    final h = TestHarness(api: api, prefs: FakeAppPrefs(seen: true));
    await h.start(tester);
    return h;
  }

  /// Sets the search area from the (fake) GPS: Kothrud, Pune.
  Future<void> useGps(WidgetTester tester) async {
    await tapKey(tester, 'area-chip');
    await tapKey(tester, 'area-gps');
  }

  testWidgets('a guest browses the feed and opens an item', (tester) async {
    final api = FakeSajhaApi();
    final m = seedMarket(api);
    final h = await guest(tester, api);
    expect(location(h), Routes.home);
    expect(find.text('Borrow what you need'), findsOneWidget);
    expect(find.byKey(const ValueKey('home-sign-in')), findsOneWidget);
    expect(find.byKey(const ValueKey('set-area')), findsOneWidget);

    // With an area, "Near you" lists what's within 10 km, closest first.
    await useGps(tester);
    expect(find.text('Current location · 5 km'), findsOneWidget);
    expect(api.lastQueries['/home']!['lat'], '18.5074');
    final near = find.byKey(const ValueKey('section-near'));
    expect(near, findsOneWidget);
    expect(
      find.descendant(of: near, matching: find.text('Kothrud, Pune · < 1 km')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: near, matching: find.text('Bengaluru trekking tent')),
      findsNothing,
    );

    await tester.tap(find.byKey(ValueKey('card-${m.camera}')).first);
    await settle(tester);
    expect(location(h), Routes.item(m.camera));
    expect(find.text('Canon EOS 200D camera'), findsOneWidget);
    expect(find.textContaining('Shivajinagar, Pune · 3'), findsOneWidget);
    expect(find.text('Vikram Rao'), findsOneWidget);
    // Booking comes later; chat is open.
    final book = tester.widget<FilledButton>(
      find.byKey(const ValueKey('request-booking')),
    );
    expect(book.onPressed, isNull);
    final chat = tester.widget<OutlinedButton>(
      find.byKey(const ValueKey('chat-lender')),
    );
    expect(chat.onPressed, isNotNull);

    // The view counts, and the item joins "Recently viewed".
    expect(api.views[m.camera], 1);
    expect(h.prefs.recent, [m.camera]);
    await tester.pageBack();
    await settle(tester);
    await tester.drag(
      find.byKey(const ValueKey('home-feed')),
      const Offset(0, -500),
    );
    await settle(tester);
    expect(find.byKey(const ValueKey('section-recent')), findsOneWidget);
  });

  testWidgets('saving as a guest asks to sign in, then comes back saved', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final m = seedMarket(api);
    api.seedSession(); // Rahul, the borrower, already has an account.
    final h = await guest(tester, api);
    h.container.read(routerProvider).push(Routes.item(m.tent));
    await settle(tester);

    await tapKey(tester, 'save-${m.tent}');
    expect(location(h), Routes.login);
    expect(find.textContaining('bring you right back'), findsOneWidget);

    await enterText(tester, 'phone-input', '9876543210');
    await tester.tap(find.byKey(const ValueKey('consent')));
    await settle(tester, 2);
    await tapText(tester, 'Send code');
    await enterText(tester, 'otp-input', FakeSajhaApi.code);
    await settle(tester);

    expect(location(h), Routes.item(m.tent, save: true));
    final rahul = api.favorites.keys.single;
    expect(api.favorites[rahul], [m.tent]);
    expect(find.text('Saved to wishlist'), findsOneWidget);
    expect(find.byIcon(Icons.favorite), findsOneWidget);

    // Nothing to go back to: home is one tap away.
    await tapKey(tester, 'item-home');
    expect(location(h), Routes.home);
    expect(find.byKey(const ValueKey('open-wishlist')), findsOneWidget);
  });

  testWidgets('backing out of sign-in returns to the item, unsaved', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final m = seedMarket(api);
    final h = await guest(tester, api);
    h.container.read(routerProvider).push(Routes.item(m.tent));
    await settle(tester);

    await tapKey(tester, 'save-${m.tent}');
    expect(location(h), Routes.login);
    await tapKey(tester, 'cancel-sign-in');
    expect(location(h), Routes.item(m.tent));
    expect(api.favorites, isEmpty);
    expect(find.byIcon(Icons.favorite_border), findsOneWidget);
  });

  testWidgets('first run: onboarding, then browse without an account', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    seedMarket(api);
    final h = TestHarness(api: api);
    await h.start(tester);
    await tapText(tester, 'Skip');
    expect(location(h), Routes.login);
    await tapKey(tester, 'browse-as-guest');
    expect(location(h), Routes.home);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('section-newest')),
      300,
      scrollable: find
          .descendant(
            of: find.byKey(const ValueKey('home-feed')),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('Bengaluru trekking tent'), findsOneWidget); // newest

    // Lender-only pages still need an account.
    h.container.read(routerProvider).go(Routes.wishlist);
    await settle(tester);
    expect(location(h), Routes.login);
  });

  testWidgets('search: area, keywords, filters, sort and a wider radius', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final m = seedMarket(api);
    final h = await guest(tester, api);
    await useGps(tester);

    await tapKey(tester, 'home-search');
    expect(location(h), Routes.search);
    // Within 5 km, nearest first; Bengaluru is out.
    expect(api.lastQueries['/search']!['radiusKm'], '5');
    expect(find.byKey(ValueKey('card-${m.tent}')), findsOneWidget);
    expect(find.byKey(ValueKey('card-${m.camera}')), findsOneWidget);
    expect(find.byKey(ValueKey('card-${m.far}')), findsNothing);
    expect(find.text('Nearest first'), findsOneWidget);
    expect(
      tester.getTopLeft(find.byKey(ValueKey('card-${m.tent}'))).dx,
      lessThan(tester.getTopLeft(find.byKey(ValueKey('card-${m.camera}'))).dx),
    );

    // Keywords (stemmed: "tents" finds the tent).
    await tester.enterText(find.byKey(const ValueKey('search-input')), 'tents');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await settle(tester);
    expect(api.lastQueries['/search']!['q'], 'tents');
    expect(find.byKey(ValueKey('card-${m.tent}')), findsOneWidget);
    expect(find.byKey(ValueKey('card-${m.camera}')), findsNothing);

    // Filters: condition and verified lenders reach the query.
    await tester.enterText(find.byKey(const ValueKey('search-input')), '');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await settle(tester);
    await tapKey(tester, 'open-filters');
    await tapKey(tester, 'filter-cond-LIKE_NEW');
    await tapKey(tester, 'filter-apply');
    expect(api.lastQueries['/search']!['condition'], 'LIKE_NEW');
    expect(find.text('Filters · 1'), findsOneWidget);
    expect(find.byKey(ValueKey('card-${m.camera}')), findsOneWidget);
    expect(find.byKey(ValueKey('card-${m.tent}')), findsNothing);

    await tapKey(tester, 'open-filters');
    await tapKey(tester, 'filter-verified');
    await tapKey(tester, 'filter-apply');
    expect(api.lastQueries['/search']!['verifiedLendersOnly'], 'true');
    // The camera's lender isn't ID-verified: nothing left nearby.
    expect(find.byKey(const ValueKey('search-empty')), findsOneWidget);
    expect(find.text('Nothing found within 5 km'), findsOneWidget);

    await tapKey(tester, 'widen-radius');
    expect(api.lastQueries['/search']!['radiusKm'], '10');
    expect(find.text('Nothing found within 10 km'), findsOneWidget);

    // Reset and sort by price, highest first.
    await tapKey(tester, 'open-filters');
    await tapKey(tester, 'filter-reset');
    await tapKey(tester, 'filter-apply');
    expect(api.lastQueries['/search']!.containsKey('condition'), isFalse);
    await tester.tap(find.byKey(const ValueKey('sort-menu')));
    await settle(tester);
    await tester.tap(find.byKey(const ValueKey('sort-price_desc')));
    await settle(tester);
    expect(api.lastQueries['/search']!['sort'], 'price_desc');
    expect(
      tester.getTopLeft(find.byKey(ValueKey('card-${m.camera}'))).dx,
      lessThan(tester.getTopLeft(find.byKey(ValueKey('card-${m.tent}'))).dx),
    );
  });

  testWidgets('search results load more as you scroll, without repeats', (
    tester,
  ) async {
    final api = FakeSajhaApi()..searchPageSize = 4;
    final lender = api.seedLender();
    for (var i = 0; i < 9; i++) {
      api.seedListing(lenderId: lender, title: 'Tent $i');
    }
    final h = await guest(tester, api);
    h.container.read(routerProvider).push(Routes.search);
    await settle(tester);
    expect(find.text('Tent 8'), findsOneWidget); // newest first

    for (var i = 0; i < 6; i++) {
      await tester.drag(
        find.byKey(const ValueKey('search-results')),
        const Offset(0, -600),
      );
      await settle(tester, 4);
    }
    expect(api.requests.where((r) => r == 'GET /search'), hasLength(3));
    expect(find.text('9 items'), findsOneWidget);
  });

  testWidgets('dates give a price breakdown, or say why they don’t work', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final lender = api.seedLender();
    final tent = api.seedListing(
      lenderId: lender,
      blocks: [
        {'startsOn': isoDate(day(20)), 'endsOn': isoDate(day(22))},
      ],
    );
    final h = await guest(tester, api);
    h.container.read(routerProvider).push(Routes.item(tent.id));
    await settle(tester);

    // 8 days from the day after tomorrow: the weekly discount applies.
    h.nextDates = DateTimeRange(start: day(2), end: day(9));
    await tapKey(tester, 'choose-dates');
    expect(
      api.lastQueries['/listings/${tent.id}/quote']!['startDate'],
      isoDate(day(2)),
    );
    expect(find.byKey(const ValueKey('quote-card')), findsOneWidget);
    expect(find.text('₹150 × 8 days'), findsOneWidget);
    expect(find.text('₹1,200'), findsOneWidget);
    expect(find.text('−₹120'), findsOneWidget); // 10% weekly discount
    expect(find.text('Free'), findsOneWidget);
    // ₹1,080 rent + ₹1,000 deposit.
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('quote-total'))).data,
      '₹2,080',
    );
    expect(find.text('₹2,080 total'), findsOneWidget);

    // The picker greys out blocked days and days inside the notice period.
    expect(h.lastSelectable!(day(0)), isFalse); // 1 day's notice
    expect(h.lastSelectable!(day(1)), isTrue);
    expect(h.lastSelectable!(day(21)), isFalse);

    h.nextDates = DateTimeRange(start: day(19), end: day(23));
    await tapKey(tester, 'choose-dates');
    expect(find.byKey(const ValueKey('quote-unavailable')), findsOneWidget);
    expect(
      find.text('The lender has blocked some of these dates.'),
      findsOneWidget,
    );
    expect(find.text('₹150 / day'), findsWidgets);
  });

  testWidgets('dates in search narrow results and show the rent', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final lender = api.seedLender();
    final free = api.seedListing(lenderId: lender, title: 'Free tent');
    final busy = api.seedListing(
      lenderId: lender,
      title: 'Busy tent',
      blocks: [
        {'startsOn': isoDate(day(3)), 'endsOn': isoDate(day(3))},
      ],
    );
    final h = await guest(tester, api);
    h.container.read(routerProvider).push(Routes.search);
    await settle(tester);
    expect(find.byKey(ValueKey('card-${busy.id}')), findsOneWidget);

    h.nextDates = DateTimeRange(start: day(2), end: day(4));
    await tapKey(tester, 'search-dates');
    expect(api.lastQueries['/search']!['endDate'], isoDate(day(4)));
    expect(find.byKey(ValueKey('card-${busy.id}')), findsNothing);
    expect(find.byKey(ValueKey('card-${free.id}')), findsOneWidget);
    expect(find.textContaining('₹450', findRichText: true), findsOneWidget);
    expect(
      find.textContaining('for 3 days', findRichText: true),
      findsOneWidget,
    );
  });

  testWidgets('wishlist: save from a card, see it listed, remove it', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final h = TestHarness(api: api, prefs: FakeAppPrefs(seen: true));
    h.storage.refreshToken = api.seedSession();
    final m = seedMarket(api);
    await h.start(tester);

    await tapKey(tester, 'save-${m.camera}');
    expect(find.text('Saved to wishlist'), findsOneWidget);
    // Every card for it shows the heart filled.
    for (final e in find.byKey(ValueKey('save-${m.camera}')).evaluate()) {
      final button = e.widget as IconButton;
      expect((button.icon as Icon).icon, Icons.favorite);
    }

    await tapKey(tester, 'open-wishlist');
    expect(location(h), Routes.wishlist);
    expect(find.byKey(ValueKey('card-${m.camera}')), findsOneWidget);

    // Taken down since: still listed, marked.
    api.listings[m.camera]!.status = 'PAUSED';
    h.container.read(routerProvider).pop();
    await settle(tester);
    await tapKey(tester, 'open-wishlist');
    expect(find.text('No longer available'), findsOneWidget);

    await tester.tap(find.byKey(ValueKey('save-${m.camera}')));
    await settle(tester);
    expect(api.favorites.values.single, isEmpty);
    expect(find.byKey(const ValueKey('wishlist-empty')), findsOneWidget);
  });

  testWidgets('lenders see their own listing without a save button', (
    tester,
  ) async {
    final api = FakeSajhaApi();
    final h = TestHarness(api: api, prefs: FakeAppPrefs(seen: true));
    h.storage.refreshToken = api.seedSession();
    final mine = api.seedListing(); // owned by the signed-in user
    await h.start(tester);
    h.container.read(routerProvider).push(Routes.item(mine.id));
    await settle(tester);
    expect(find.text('Rahul Sharma (you)'), findsOneWidget);
    expect(find.byKey(ValueKey('save-${mine.id}')), findsNothing);
    expect(find.byKey(const ValueKey('choose-dates')), findsNothing);
    expect(api.views[mine.id], isNull); // own views don't count
  });

  testWidgets('a picked map area and radius persist', (tester) async {
    final api = FakeSajhaApi();
    seedMarket(api);
    final h = await guest(tester, api);
    await tapKey(tester, 'area-chip');
    await tapKey(tester, 'area-map');
    expect(location(h), Routes.areaPicker);
    // No area yet: the map must be moved first.
    final use = tester.widget<FilledButton>(
      find.byKey(const ValueKey('use-area')),
    );
    expect(use.onPressed, isNull);
    await tester.drag(find.byType(FlutterMap), const Offset(120, 120));
    await settle(tester);
    await tapKey(tester, 'use-area');
    expect(location(h), Routes.home);
    expect(find.text('Area on map · 5 km'), findsOneWidget);
    expect(h.prefs.area, contains('"label":"Area on map"'));

    // Unknown location, e.g. permission off: explained, and the map offered.
    h.location.next = const LocationResult.failed(LocationProblem.denied);
    await tapKey(tester, 'area-chip');
    await tapKey(tester, 'area-gps');
    expect(find.byKey(const ValueKey('area-problem')), findsOneWidget);
  });
}
