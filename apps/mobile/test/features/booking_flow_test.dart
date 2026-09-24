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

  String iso(int fromToday) => isoDate(day(fromToday));

  /// Asha lends a tent; the app user is Rahul unless [asLender].
  ({FakeSajhaApi api, String lender, String listing}) market({
    bool docs = false,
  }) {
    final api = FakeSajhaApi();
    final lender = api.seedLender(name: 'Asha Patil', idVerified: true);
    final listing = api.seedListing(
      lenderId: lender,
      title: 'Quechua trekking tent',
    );
    if (docs) api.requireDocs(listing.id, ['GOVERNMENT_ID']);
    return (api: api, lender: lender, listing: listing.id);
  }

  Future<TestHarness> signedIn(
    WidgetTester tester,
    FakeSajhaApi api, {
    bool emailVerified = true,
  }) async {
    final h = TestHarness(api: api, prefs: FakeAppPrefs(seen: true));
    h.storage.refreshToken = api.seedSession(emailVerified: emailVerified);
    await h.start(tester);
    return h;
  }

  /// Signs in as Asha, the lender, instead.
  Future<TestHarness> signedInAsLender(
    WidgetTester tester,
    FakeSajhaApi api,
  ) async {
    final h = TestHarness(api: api, prefs: FakeAppPrefs(seen: true));
    h.storage.refreshToken = api.seedSessionFor('+919812345678');
    await h.start(tester);
    return h;
  }

  Future<void> go(WidgetTester tester, TestHarness h, String route) async {
    h.container.read(routerProvider).push(route);
    await settle(tester);
  }

  Future<void> pickDates(WidgetTester tester, TestHarness h) async {
    h.nextDates = DateTimeRange(start: day(3), end: day(5));
    await tapKey(tester, 'choose-dates');
    await settle(tester);
  }

  /// Scrolls the page back to the top.
  Future<void> toTop(WidgetTester tester) async {
    await tester.drag(
      find.byType(Scrollable).hitTestable().last,
      const Offset(0, 3000),
    );
    await settle(tester);
  }

  /// The booking page's status chip (scrolling back up to it if needed).
  Future<String> statusText(WidgetTester tester) async {
    final chip = find.byKey(const ValueKey('booking-status'));
    if (chip.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        chip,
        -300,
        scrollable: find.byType(Scrollable).hitTestable().last,
      );
    }
    return tester
        .widget<Text>(find.descendant(of: chip, matching: find.byType(Text)))
        .data!;
  }

  testWidgets(
    'borrower: request → lender accepts → share an ID → approved → awaiting payment',
    (tester) async {
      final m = market(docs: true);
      final h = await signedIn(tester, m.api);
      final rahul = m.api.appUserId!;
      final pan = m.api.seedDocument(rahul, 'PAN');
      m.api.seedDocument(rahul, 'COLLEGE_ID');
      await go(tester, h, Routes.item(m.listing));

      // No dates, no request.
      final request = find.byKey(const ValueKey('request-booking'));
      expect(tester.widget<FilledButton>(request).onPressed, isNull);
      await pickDates(tester, h);
      expect(tester.widget<FilledButton>(request).onPressed, isNotNull);

      await tapKey(tester, 'request-booking');
      expect(find.byKey(const ValueKey('request-sheet')), findsOneWidget);
      expect(find.text('• Government ID'), findsOneWidget);
      expect(find.textContaining('24 hours to reply'), findsOneWidget);
      await tapKey(tester, 'confirm-request');

      final booking = m.api.bookingState.bookings.values.single;
      expect(booking.start, iso(3));
      expect(location(h), Routes.booking(booking.id));
      expect(await statusText(tester), 'Requested');
      expect(find.textContaining('Waiting for Asha to reply'), findsOneWidget);
      expect(find.byKey(const ValueKey('booking-countdown')), findsOneWidget);

      // Asha accepts on her phone: the page updates live.
      m.api.bookingActAs(m.lender, booking.id, 'accept');
      await settle(tester);
      expect(await statusText(tester), 'Waiting for documents');
      await tapKey(tester, 'booking-share');
      expect(location(h), Routes.bookingShare(booking.id));
      // Only documents that count are offered; the PAN is picked.
      expect(find.byKey(ValueKey('pick-${pan.id}')), findsOneWidget);
      expect(find.text('College ID'), findsNothing);
      final share = find.byKey(const ValueKey('share-submit'));
      expect(tester.widget<FilledButton>(share).onPressed, isNull);
      await tapKey(tester, 'share-consent');
      await tapKey(tester, 'share-submit');

      expect(location(h), Routes.booking(booking.id));
      expect(booking.shares.single.document.id, pan.id);
      expect(find.textContaining('Waiting for Asha to review'), findsOneWidget);
      expect(find.textContaining('Not opened yet'), findsOneWidget);

      // Asha opens it (Rahul sees that) and approves.
      m.api.bookingActAs(m.lender, booking.id, 'documents/approve');
      await settle(tester);
      expect(await statusText(tester), 'Waiting for payment');
      expect(find.textContaining('Pay to confirm'), findsOneWidget);
      expect(find.byKey(const ValueKey('booking-pay')), findsOneWidget);
      expect(find.textContaining('Dates held for'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('booking-event-3')),
        300,
        scrollable: find.byType(Scrollable).hitTestable().last,
      );
      expect(find.byKey(const ValueKey('booking-event-4')), findsNothing);
    },
  );

  testWidgets('lender: accept, view the ID securely (watermark), approve', (
    tester,
  ) async {
    final m = market(docs: true);
    final rahul = m.api.seedLender(
      name: 'Rahul Sharma',
      phone: '+919900000001',
    );
    final dl = m.api.seedDocument(rahul, 'DRIVING_LICENCE');
    final booking = m.api.requestAs(
      rahul,
      m.listing,
      start: iso(3),
      end: iso(4),
    );
    final h = await signedInAsLender(tester, m.api);
    await go(tester, h, Routes.booking(booking.id));
    expect(find.textContaining('Rahul wants to borrow this'), findsOneWidget);

    await tapKey(tester, 'booking-accept');
    expect(booking.status, 'AWAITING_DOCS');
    expect(find.textContaining('Waiting for Rahul to share'), findsOneWidget);
    expect(find.byKey(const ValueKey('docs-approve')), findsNothing);

    // Rahul shares his licence from his phone.
    m.api.bookingActAs(rahul, booking.id, 'documents', {
      'shares': [
        {'requiredDocId': 'req-${m.listing}-0', 'userDocumentId': dl.id},
      ],
    });
    await settle(tester);
    expect(find.textContaining('Rahul shared their documents'), findsOneWidget);

    final shareId = booking.shares.single.id;
    await tapKey(tester, 'shared-$shareId');
    expect(h.screen.protected, isTrue);
    expect(find.byKey(const ValueKey('document-watermark')), findsOneWidget);
    expect(
      find.textContaining('Shared with Asha Patil for booking'),
      findsWidgets,
    );
    expect(booking.shares.single.views, hasLength(1));
    // A screen recording hides it (iOS).
    h.screen.recording = true;
    await settle(tester, 2);
    expect(find.byKey(const ValueKey('document-hidden')), findsOneWidget);
    h.screen.recording = false;
    await tester.pageBack();
    await settle(tester);
    expect(h.screen.protected, isFalse);
    expect(h.screen.calls, ['protect', 'release']);

    await toTop(tester);
    await tapKey(tester, 'docs-approve');
    expect(booking.status, 'AWAITING_PAYMENT');
    expect(
      find.textContaining('The dates are held while Rahul pays'),
      findsOneWidget,
    );
  });

  testWidgets(
    'lender declines (optional reason); borrower cancels (reason needed)',
    (tester) async {
      final m = market();
      final other = m.api.seedLender(
        name: 'Priya Nair',
        phone: '+919900000002',
      );
      final first = m.api.requestAs(
        other,
        m.listing,
        start: iso(3),
        end: iso(4),
      );
      final h = await signedInAsLender(tester, m.api);
      await go(tester, h, Routes.booking(first.id));
      await tapKey(tester, 'booking-decline');
      await enterText(tester, 'reason-field', 'Away that week');
      await tapKey(tester, 'reason-confirm');
      expect(first.status, 'DECLINED');
      expect(first.declineReason, 'Away that week');
      expect(find.textContaining('Declined: “Away that week”'), findsOneWidget);
      expect(find.byKey(const ValueKey('booking-cancel')), findsNothing);
    },
  );

  testWidgets('borrower cancels a request with a reason', (tester) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final b = m.api.requestAs(
      m.api.appUserId!,
      m.listing,
      start: iso(3),
      end: iso(4),
    );
    await go(tester, h, Routes.booking(b.id));
    await tapKey(tester, 'booking-cancel');
    // A reason is required.
    final confirm = find.byKey(const ValueKey('reason-confirm'));
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull);
    await enterText(tester, 'reason-field', 'Plans changed');
    await tapKey(tester, 'reason-confirm');
    expect(b.status, 'CANCELLED');
    expect(b.cancelledBy, 'BORROWER');
    expect(find.textContaining('You cancelled this booking'), findsOneWidget);
  });

  testWidgets(
    'a guest picks dates, taps Request, signs in and comes back to send it',
    (tester) async {
      final m = market();
      m.api.seedSession(); // Rahul already has an account
      final h = TestHarness(api: m.api, prefs: FakeAppPrefs(seen: true));
      await h.start(tester);
      await go(tester, h, Routes.item(m.listing));
      await pickDates(tester, h);
      await tapKey(tester, 'request-booking');
      expect(location(h), Routes.login);

      await enterText(tester, 'phone-input', '9876543210');
      await tester.tap(find.byKey(const ValueKey('consent')));
      await settle(tester, 2);
      await tapText(tester, 'Send code');
      await enterText(tester, 'otp-input', FakeSajhaApi.code);
      await settle(tester);
      await settle(tester);

      expect(find.byKey(const ValueKey('request-sheet')), findsOneWidget);
      await tapKey(tester, 'confirm-request');
      final b = m.api.bookingState.bookings.values.single;
      expect((b.start, b.end), (iso(3), iso(5)));
      expect(location(h), Routes.booking(b.id));
    },
  );

  testWidgets('without a verified email, Request asks to verify it first', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api, emailVerified: false);
    await go(tester, h, Routes.item(m.listing));
    await pickDates(tester, h);
    await tapKey(tester, 'request-booking');
    expect(find.text('Verify your email first'), findsOneWidget);
    expect(m.api.bookingState.bookings, isEmpty);
  });

  testWidgets('an accepted chat offer opens as a booking from the chat', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final c = m.api.seedConversation(m.api.appUserId!, m.listing);
    m.api.offerAs(
      m.lender,
      c.id,
      start: iso(6),
      end: iso(7),
      pricePerDayPaise: 12000,
    );
    await go(tester, h, Routes.chat(c.id));
    await tapKey(tester, 'offer-accept');
    expect(find.byKey(const ValueKey('deal-banner')), findsOneWidget);
    expect(
      find.textContaining('The booking has the next steps'),
      findsOneWidget,
    );

    await tapKey(tester, 'open-booking');
    final b = m.api.bookingState.bookings.values.single;
    expect(location(h), Routes.booking(b.id));
    expect(await statusText(tester), 'Waiting for payment');
    expect(find.text('Deal agreed in chat'), findsOneWidget);
    expect(find.text('Price agreed in chat.'), findsOneWidget);
  });

  testWidgets(
    'the bell: a live badge, the list, and tapping opens the booking',
    (tester) async {
      final m = market();
      final rahul = m.api.seedLender(
        name: 'Rahul Sharma',
        phone: '+919900000001',
      );
      final h = await signedInAsLender(tester, m.api);
      expect(find.byKey(const ValueKey('bell-badge')), findsNothing);

      final b = m.api.requestAs(rahul, m.listing, start: iso(3), end: iso(4));
      await settle(tester);
      expect(find.byKey(const ValueKey('bell-badge')), findsOneWidget);

      await tapKey(tester, 'open-notifications');
      expect(location(h), Routes.notifications);
      expect(find.text('New booking request'), findsOneWidget);
      await settle(tester);
      expect(m.api.notificationsFor(m.lender).single.readAt, isNotNull);

      await tapText(tester, 'New booking request');
      expect(location(h), Routes.booking(b.id));
      await tester.pageBack();
      await settle(tester);
      await tester.pageBack();
      await settle(tester);
      expect(find.byKey(const ValueKey('bell-badge')), findsNothing);
    },
  );

  testWidgets('My bookings: borrowing and lending, in progress and past', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final rahul = m.api.appUserId!;
    final open = m.api.requestAs(rahul, m.listing, start: iso(3), end: iso(4));
    // Rahul also lends something, and Asha's earlier request expired.
    final mine = m.api.seedListing(lenderId: rahul, title: 'GoPro Hero 11');
    final lent = m.api.requestAs(m.lender, mine.id, start: iso(8), end: iso(9));
    m.api.expireBooking(lent.id);

    await tapKey(tester, 'open-bookings');
    expect(location(h), Routes.bookings);
    expect(find.byKey(ValueKey('booking-${open.id}')), findsOneWidget);

    await tapKey(tester, 'tab-lending');
    expect(find.byKey(const ValueKey('bookings-empty')), findsOneWidget);
    await tapText(tester, 'Past');
    expect(find.byKey(ValueKey('booking-${lent.id}')), findsOneWidget);
    expect(find.text('Expired'), findsOneWidget);

    await tapKey(tester, 'booking-${lent.id}');
    expect(location(h), Routes.booking(lent.id));
  });

  testWidgets('a tapped booking push opens the booking', (tester) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final b = m.api.requestAs(
      m.api.appUserId!,
      m.listing,
      start: iso(3),
      end: iso(4),
    );
    h.push.openedController.add(PushOpen(bookingId: b.id));
    await settle(tester);
    expect(location(h), Routes.booking(b.id));
  });
}
