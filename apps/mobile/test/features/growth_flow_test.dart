import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/push/push_service.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';
import 'package:sajha/features/listings/data/models.dart' show isoDate;

import '../helpers/fake_api.dart';
import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  setUp(() {
    final view =
        TestWidgetsFlutterBinding.instance.platformDispatcher.views.first;
    view
      ..physicalSize = const Size(1080, 2400)
      ..devicePixelRatio = 3;
    addTearDown(view.reset);
  });

  String location(TestHarness h) =>
      h.container.read(routerProvider).state.uri.toString();

  DateTime day(int fromToday) {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day + fromToday);
  }

  /// Asha lends a tent in Kothrud, Pune; she can sign in as the lender.
  ({FakeSajhaApi api, String lender, String listing}) market() {
    final api = FakeSajhaApi();
    final lender = api.seedLender(name: 'Asha Patil', idVerified: true);
    final listing = api.seedListing(
      lenderId: lender,
      title: 'Quechua trekking tent',
      lat: 18.5080,
      lng: 73.8080,
    );
    return (api: api, lender: lender, listing: listing.id);
  }

  /// Signed in (as Rahul unless [phone]), with the search area on Kothrud.
  Future<TestHarness> signedIn(
    WidgetTester tester,
    FakeSajhaApi api, {
    String? phone,
    bool area = true,
  }) async {
    final prefs = FakeAppPrefs(seen: true);
    if (area) {
      prefs.area = jsonEncode({
        'lat': 18.5074,
        'lng': 73.8077,
        'label': 'Current location',
        'radiusKm': 5,
      });
    }
    final h = TestHarness(api: api, prefs: prefs);
    h.storage.refreshToken = phone == null
        ? api.seedSession()
        : api.seedSessionFor(phone);
    await h.start(tester);
    return h;
  }

  Future<void> go(WidgetTester tester, TestHarness h, String route) async {
    h.container.read(routerProvider).push(route);
    await settle(tester);
  }

  Future<void> back(WidgetTester tester) async {
    await tester.pageBack();
    await settle(tester);
  }

  testWidgets(
    'saved searches: save from results, then switch alerts off, rename, '
    'open and delete',
    (tester) async {
      final m = market();
      final h = await signedIn(tester, m.api);
      await go(
        tester,
        h,
        Uri(path: Routes.search, queryParameters: {'q': 'tent'}).toString(),
      );
      expect(find.byKey(ValueKey('card-${m.listing}')), findsOneWidget);

      await tapKey(tester, 'save-search');
      expect(
        find.text('Search saved. We’ll tell you about new listings.'),
        findsOneWidget,
      );
      final saved = m.api.growth.savedSearches.single;
      expect(saved.name, '“tent” within 5 km');
      expect(saved.filters['q'], 'tent');
      expect(saved.filters['lat'], 18.5074);
      expect(saved.filters.containsKey('startDate'), isFalse);

      // Reachable from the profile.
      await back(tester);
      await tapKey(tester, 'open-profile');
      await tapKey(tester, 'open-saved-searches');
      expect(location(h), Routes.savedSearches);
      expect(find.text('“tent” within 5 km'), findsOneWidget);
      expect(find.text('within 5 km'), findsOneWidget);

      // Alerts off, straight away and on the server.
      await tapKey(tester, 'alerts-${saved.id}');
      expect(
        tester.widget<Switch>(find.byKey(ValueKey('alerts-${saved.id}'))).value,
        isFalse,
      );
      expect(saved.alertsEnabled, isFalse);

      await tapKey(tester, 'saved-menu-${saved.id}');
      await tapKey(tester, 'saved-rename');
      await enterText(tester, 'rename-input', 'Tents near home');
      await tapKey(tester, 'rename-save');
      expect(saved.name, 'Tents near home');
      expect(find.text('Tents near home'), findsOneWidget);

      // Opening it runs the search again.
      await tapKey(tester, 'saved-search-${saved.id}');
      expect(location(h), Routes.savedSearch(saved.id));
      expect(find.byKey(ValueKey('card-${m.listing}')), findsOneWidget);
      await back(tester);

      await tapKey(tester, 'saved-menu-${saved.id}');
      await tapKey(tester, 'saved-delete');
      expect(find.text('Delete this search?'), findsOneWidget);
      await tapText(tester, 'Delete');
      expect(m.api.growth.savedSearches, isEmpty);
      expect(
        find.byKey(const ValueKey('saved-searches-empty')),
        findsOneWidget,
      );
    },
  );

  testWidgets('the eleventh saved search is refused with the API’s reason', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final rahul = m.api.appUserId!;
    for (var i = 0; i < 10; i++) {
      m.api.growth.savedSearches.add(
        FakeSavedSearch('saved-old-$i', rahul, 'Search $i', {
          'lat': 18.5,
          'lng': 73.8,
          'radiusKm': 5,
        }),
      );
    }
    await go(tester, h, Routes.search);
    await tapKey(tester, 'save-search');
    expect(
      find.text('You can save up to 10 searches. Delete one to save another.'),
      findsOneWidget,
    );
    expect(m.api.growth.savedSearches, hasLength(10));
  });

  testWidgets('a guest who saves a search is asked to sign in', (tester) async {
    final m = market();
    final prefs = FakeAppPrefs(seen: true)
      ..area = jsonEncode({
        'lat': 18.5074,
        'lng': 73.8077,
        'label': 'Current location',
        'radiusKm': 5,
      });
    final h = TestHarness(api: m.api, prefs: prefs);
    await h.start(tester);
    await go(
      tester,
      h,
      Uri(path: Routes.search, queryParameters: {'q': 'tent'}).toString(),
    );
    await tapKey(tester, 'save-search');
    expect(location(h), Routes.login);
    expect(m.api.growth.savedSearches, isEmpty);
  });

  testWidgets('asks the community from Home, then sees and closes it in '
      'My requests', (tester) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    await tapKey(tester, 'open-requests');
    expect(location(h), Routes.requests);
    expect(find.byKey(const ValueKey('requests-empty')), findsOneWidget);

    await tapKey(tester, 'new-request');
    expect(location(h), Routes.newRequest);
    await enterText(tester, 'request-title', 'Need a projector');
    await enterText(
      tester,
      'request-details',
      'For a film night on Saturday, any HD one works.',
    );
    await tapKey(tester, 'request-category');
    await tapText(tester, 'Cameras & electronics');
    h.nextDates = DateTimeRange(start: day(3), end: day(4));
    await tapKey(tester, 'request-dates');
    await enterText(tester, 'request-budget', '300');
    await enterText(tester, 'request-area', 'Kothrud, Pune');
    await tapKey(tester, 'post-request');

    final r = m.api.growth.requests.values.single;
    expect(r.fields['title'], 'Need a projector');
    expect(r.fields['categoryId'], 'cat-camera');
    expect(r.fields['startDate'], isoDate(day(3)));
    expect(r.fields['budgetPerDayPaise'], 30000);
    expect(r.fields['areaLabel'], 'Kothrud, Pune');
    expect(r.lat, 18.5074);
    expect(location(h), Routes.myRequests);
    expect(find.text('Need a projector'), findsOneWidget);
    expect(find.text('No offers yet'), findsOneWidget);

    await tapKey(tester, 'close-${r.id}');
    await tapText(tester, 'Close request');
    expect(r.status, 'CLOSED');
    expect(find.textContaining('Closed ·'), findsOneWidget);
    expect(find.byKey(ValueKey('close-${r.id}')), findsNothing);
  });

  testWidgets('a lender offers a listing on a nearby request and lands in the '
      'chat', (tester) async {
    final m = market();
    final rahul = m.api.seedLender(
      name: 'Rahul Sharma',
      phone: '+919876543210',
    );
    final r = m.api.seedRequest(rahul, title: 'Need a 4-person tent');
    final far = m.api.seedRequest(
      rahul,
      title: 'Need a bike in Bengaluru',
      lat: 12.97,
      lng: 77.59,
    );
    final h = await signedIn(tester, m.api, phone: '+919812345678');
    await go(tester, h, Routes.requests);
    expect(find.text('Need a 4-person tent'), findsOneWidget);
    expect(find.text('Need a bike in Bengaluru'), findsNothing);
    expect(m.api.lastQueries['/requests']!['lat'], '18.5074');
    expect(far.status, 'OPEN');

    await tapKey(tester, 'request-${r.id}');
    expect(location(h), Routes.request(r.id));
    expect(find.text('Rahul Sharma'), findsOneWidget);
    await tapKey(tester, 'offer-item');
    expect(find.byKey(const ValueKey('offer-sheet')), findsOneWidget);
    await tapKey(tester, 'offer-listing-${m.listing}');
    await enterText(tester, 'offer-message', 'Mine fits four. Free that week.');
    await tapKey(tester, 'send-offer');

    final response = r.responses.single;
    expect(response.listingId, m.listing);
    expect(location(h), Routes.chat(response.conversationId));
    expect(find.text('Mine fits four. Free that week.'), findsOneWidget);
    expect(m.api.notificationsFor(rahul).single.type, 'request.response');

    // Back on the request: the offer shows, and the same item can't go twice.
    await back(tester);
    expect(find.text('Your offers'), findsOneWidget);
    await tapKey(tester, 'offer-item');
    await tapKey(tester, 'offer-listing-${m.listing}');
    await enterText(tester, 'offer-message', 'Just checking!');
    await tapKey(tester, 'send-offer');
    expect(find.text('You’ve already offered this item.'), findsOneWidget);
    expect(r.responses, hasLength(1));

    await tapKey(tester, 'request-menu');
    await tapKey(tester, 'request-report');
    await tapKey(tester, 'reason-SPAM');
    await tapKey(tester, 'report-submit');
    expect(m.api.chat.reports.single['targetType'], 'REQUEST');
    expect(m.api.chat.reports.single['targetId'], r.id);
  });

  testWidgets('bell and push open the listing, the request or invites', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final rahul = m.api.appUserId!;
    final r = m.api.seedRequest(rahul, title: 'Need a 4-person tent');
    m.api.notifyUser(
      rahul,
      'search.alert',
      'New for “tent”',
      'Quechua trekking tent is on Sajha now.',
      listingId: m.listing,
    );
    final alert = m.api.notificationsFor(rahul).last;
    m.api.notifyUser(
      rahul,
      'request.response',
      'Someone has one',
      'Asha offered Quechua trekking tent.',
      requestId: r.id,
    );
    final answer = m.api.notificationsFor(rahul).last;

    await go(tester, h, Routes.notifications);
    await tapKey(tester, 'notification-${alert.id}');
    expect(location(h), Routes.item(m.listing));
    await back(tester);
    await tapKey(tester, 'notification-${answer.id}');
    expect(location(h), Routes.request(r.id));
    expect(find.text('Need a 4-person tent'), findsOneWidget);

    h.push.openedController.add(PushOpen(listingId: m.listing));
    await settle(tester);
    expect(location(h), Routes.item(m.listing));
    h.push.openedController.add(const PushOpen(type: 'referral.rewarded'));
    await settle(tester);
    expect(location(h), Routes.invite);
  });

  testWidgets('invite friends: share the code, then redeem a friend’s', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final rahul = m.api.appUserId!;
    final ashaCode = m.api.referralCodeFor(m.lender);

    // New members see the code card on Home too, and can put it away.
    await tapKey(tester, 'dismiss-invite-card');
    expect(find.byKey(const ValueKey('invite-code-card')), findsNothing);

    await tapKey(tester, 'open-profile');
    await tapKey(tester, 'open-invite');
    expect(location(h), Routes.invite);
    final code = m.api.referralCodeFor(rahul);
    expect(find.text(code), findsOneWidget);
    expect(find.text('https://sajha.app/r/$code'), findsOneWidget);
    expect(find.text('Give ₹100, get ₹100'), findsOneWidget);

    await tapKey(tester, 'share-invite');
    expect(h.shared.single, contains(code));
    expect(h.shared.single, contains('https://sajha.app/r/$code'));

    // A wrong code, then Asha's (case and spaces don't matter).
    await enterText(tester, 'invite-code-input', 'NOPE42');
    await tapKey(tester, 'redeem-code');
    expect(find.textContaining('invite code isn’t right'), findsOneWidget);
    expect(m.api.creditBalance(rahul), 0);

    await enterText(tester, 'invite-code-input', ' ${ashaCode.toLowerCase()} ');
    await tapKey(tester, 'redeem-code');
    expect(m.api.growth.referredBy[rahul], m.lender);
    expect(m.api.creditBalance(rahul), 10000);
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('invite-credit'))).data,
      '₹100',
    );
    expect(find.text('Welcome credit'), findsOneWidget);
    expect(find.text('You joined with Asha’s invite.'), findsOneWidget);
    expect(find.byKey(const ValueKey('invite-code-card')), findsNothing);
    expect(m.api.notificationsFor(m.lender).single.type, 'referral.joined');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('invite-rules')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().last,
    );
    expect(find.textContaining('up to 50% of the rent'), findsOneWidget);
  });

  testWidgets('invite credit comes off the price and goes back on cancel', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final rahul = m.api.appUserId!;
    m.api.grantCredit(rahul, 10000);

    await go(tester, h, Routes.item(m.listing));
    h.nextDates = DateTimeRange(start: day(3), end: day(5));
    await tapKey(tester, 'choose-dates');
    String textOf(String key) =>
        tester.widget<Text>(find.byKey(ValueKey(key))).data!;
    expect(textOf('quote-credit'), '−₹100');
    // 3 days × ₹150 + ₹1,000 deposit − ₹100 credit.
    expect(textOf('quote-total'), '₹1,350');

    await tapKey(tester, 'request-booking');
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('request-sheet')),
        matching: find.text('Invite credit'),
      ),
      findsOneWidget,
    );
    await tapKey(tester, 'confirm-request');
    final b = m.api.bookingState.bookings.values.single;
    expect(b.credit, 10000);
    expect(location(h), Routes.booking(b.id));
    final line = find.byKey(const ValueKey('booking-credit'));
    await tester.scrollUntilVisible(
      line,
      200,
      scrollable: find.byType(Scrollable).hitTestable().last,
    );
    expect(
      find.descendant(of: line, matching: find.text('− ₹100')),
      findsOneWidget,
    );
    expect(find.text('₹1,350'), findsOneWidget);
    expect(m.api.creditBalance(rahul), 0);

    // The "Request sent" snackbar sits over the button.
    ScaffoldMessenger.of(tester.element(find.byType(Scaffold).last))
        .clearSnackBars();
    await tester.pumpAndSettle();
    await tapKey(tester, 'booking-cancel');
    expect(
      find.textContaining('Your invite credit goes back to your balance.'),
      findsOneWidget,
    );
  });
}
