import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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

  /// A booking date [fromToday] days from today in India, as the API counts.
  String iso(int fromToday) {
    final ist = DateTime.now().toUtc().add(
      const Duration(hours: 5, minutes: 30),
    );
    return isoDate(DateTime(ist.year, ist.month, ist.day + fromToday));
  }

  Future<void> go(WidgetTester tester, TestHarness h, String route) async {
    h.container.read(routerProvider).push(route);
    await settle(tester);
  }

  /// The page's vertical list (photo strips scroll sideways).
  Finder page() => find
      .byWidgetPredicate(
        (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
      )
      .hitTestable()
      .last;

  Future<String> statusText(WidgetTester tester) async {
    final chip = find.byKey(const ValueKey('booking-status'));
    if (chip.evaluate().isEmpty) {
      await tester.scrollUntilVisible(chip, -300, scrollable: page());
    }
    return (tester.widget<Text>(
      find.descendant(of: chip, matching: find.byType(Text)),
    )).data!;
  }

  Future<void> scrollTo(WidgetTester tester, Finder finder) =>
      tester.scrollUntilVisible(finder, 200, scrollable: page());

  /// Asha lends a tent to Rahul, paid, from [startIn] days for 2 days. The
  /// app user is Rahul, or Asha when [asLender].
  Future<({TestHarness h, FakeSajhaApi api, FakeBooking booking})> rental(
    WidgetTester tester, {
    int startIn = 0,
    bool asLender = false,
  }) async {
    final api = FakeSajhaApi();
    final lender = api.seedLender(name: 'Asha Patil', idVerified: true);
    final listing = api.seedListing(lenderId: lender);
    final h = TestHarness(api: api, prefs: FakeAppPrefs(seen: true));
    h.storage.refreshToken = asLender
        ? api.seedSessionFor('+919812345678')
        : api.seedSession();
    final borrower = asLender
        ? api.seedLender(name: 'Rahul Sharma', phone: '+919876543210')
        : null;
    await h.start(tester);
    final booking = api.seedBooking(
      borrower ?? api.appUserId!,
      listing.id,
      start: iso(startIn),
      end: iso(startIn + 1),
      status: 'AWAITING_PAYMENT',
    );
    api.payAs(booking.id);
    return (h: h, api: api, booking: booking);
  }

  /// Adds [n] photos through the grid (camera each time).
  Future<void> addPhotos(WidgetTester tester, int n) async {
    for (var i = 0; i < n; i++) {
      await tapKey(tester, 'photo-add');
      await tapText(tester, 'Take photo');
    }
  }

  testWidgets('borrower shows the handover code; it closes once handed over', (
    tester,
  ) async {
    final t = await rental(tester);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(find.textContaining('Show your handover code'), findsOneWidget);

    await tapKey(tester, 'booking-show-code');
    expect(location(t.h), Routes.bookingCode(t.booking.id));
    expect(find.text('482 913'), findsOneWidget);
    expect(find.byKey(const ValueKey('rental-qr')), findsOneWidget);

    // Asha scans it on her phone.
    t.api.handOverAs(t.booking.id);
    await settle(tester);
    expect(location(t.h), Routes.booking(t.booking.id));
    expect(find.text('Handed over'), findsOneWidget);
    expect(await statusText(tester), 'In progress');
    expect(find.byKey(const ValueKey('booking-return')), findsOneWidget);
  });

  testWidgets('lender hands over: scan the code, take photos, confirm', (
    tester,
  ) async {
    final t = await rental(tester, asLender: true);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(find.textContaining('Pickup day!'), findsOneWidget);
    await tapKey(tester, 'booking-handover');
    expect(location(t.h), Routes.bookingHandover(t.booking.id));

    // A QR from another booking is refused.
    t.h.nextScan = 'sajha://booking/someone-else/HANDOVER/482913';
    await tapKey(tester, 'stage-scan');
    expect(find.text('That isn’t the code for this booking.'), findsOneWidget);

    // A typed wrong code: the API says so.
    await enterText(tester, 'stage-code', '000000');
    await addPhotos(tester, 2);
    expect(t.h.picker.calls, hasLength(2));
    await tapKey(tester, 'stage-confirm');
    expect(find.textContaining('doesn’t match'), findsOneWidget);
    expect(t.booking.status, 'CONFIRMED');

    // Scanning fills in the right one.
    t.h.nextScan = 'sajha://booking/${t.booking.id}/HANDOVER/482913';
    await tapKey(tester, 'stage-scan');
    expect(find.text('482913'), findsOneWidget);
    await tapKey(tester, 'stage-confirm');

    expect(location(t.h), Routes.booking(t.booking.id));
    expect(t.booking.status, 'ACTIVE');
    expect(find.text('Handed over'), findsOneWidget);
    await scrollTo(tester, find.byKey(const ValueKey('condition-photos')));
    expect(find.textContaining('At handover · You'), findsOneWidget);
    expect(find.byKey(const ValueKey('condition-0-1')), findsOneWidget);
    // The lender now shows the return code.
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('booking-show-code')),
      -200,
      scrollable: page(),
    );
    expect(find.text('Show return code'), findsOneWidget);
  });

  testWidgets('a late return: the banner, then the fee from the deposit', (
    tester,
  ) async {
    // It was due back yesterday.
    final t = await rental(tester, startIn: -2);
    t.api.handOverAs(t.booking.id);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(find.byKey(const ValueKey('late-banner')), findsOneWidget);
    expect(find.textContaining('1 day late'), findsOneWidget);
    expect(find.textContaining('₹150'), findsWidgets);

    await tapKey(tester, 'booking-return');
    await enterText(tester, 'stage-code', '135790');
    // One photo isn't enough.
    await addPhotos(tester, 1);
    final confirm = find.byKey(const ValueKey('stage-confirm'));
    expect(tester.widget<FilledButton>(confirm).onPressed, isNull);
    await addPhotos(tester, 1);
    await tapKey(tester, 'stage-confirm');

    expect(t.booking.status, 'RETURNED');
    expect(find.text('Return confirmed'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('booking-next-step')),
      -200,
      scrollable: page(),
    );
    expect(find.byKey(const ValueKey('late-banner')), findsNothing);
    expect(find.textContaining('Deposit settles in'), findsOneWidget);
    await scrollTo(tester, find.byKey(const ValueKey('booking-late-fee')));
    expect(find.textContaining('Late fee (1 day'), findsOneWidget);
  });

  testWidgets('lender reports a problem; the claim shows on the page', (
    tester,
  ) async {
    final t = await rental(tester, asLender: true);
    t.api
      ..handOverAs(t.booking.id)
      ..returnAs(t.booking.id);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(find.textContaining('you can report a problem'), findsOneWidget);

    await tapKey(tester, 'booking-dispute');
    // "Not returned" isn't offered once it's back.
    expect(
      find.byKey(const ValueKey('dispute-reason-NOT_RETURNED')),
      findsNothing,
    );
    await tapKey(tester, 'dispute-reason-DAMAGE');
    await enterText(tester, 'dispute-amount', '1500');
    expect(find.text('At most ₹1,000'), findsOneWidget);
    await enterText(tester, 'dispute-amount', '600');
    await enterText(
      tester,
      'dispute-text',
      'The rain fly is torn along one seam.',
    );
    await addPhotos(tester, 1);
    await tapKey(tester, 'dispute-submit');

    expect(t.booking.status, 'DISPUTED');
    expect(find.text('Problem reported to Sajha'), findsOneWidget);
    await scrollTo(tester, find.byKey(const ValueKey('dispute-claim')));
    expect(find.text('You: Damaged, asking to keep ₹600'), findsOneWidget);
    expect(find.byKey(const ValueKey('evidence-0')), findsOneWidget);
  });

  testWidgets('borrower gives their side of the claim, then sees the outcome', (
    tester,
  ) async {
    final t = await rental(tester);
    t.api
      ..handOverAs(t.booking.id)
      ..returnAs(t.booking.id)
      ..disputeAs(t.booking.id);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(find.textContaining('Give your side'), findsWidgets);

    await tapKey(tester, 'booking-respond');
    expect(find.text('Asha says: Damaged'), findsOneWidget);
    await enterText(tester, 'dispute-text', 'It was already torn at pickup.');
    await tapKey(tester, 'dispute-submit');
    expect(find.text('Your side was sent'), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-respond')), findsNothing);
    await scrollTo(tester, find.byKey(const ValueKey('dispute-response')));
    expect(find.text('“It was already torn at pickup.”'), findsOneWidget);

    // Sajha decides: ₹600 to Asha, ₹400 back.
    t.api.completeRental(t.booking.id, kept: 60000);
    await settle(tester);
    expect(await statusText(tester), 'Completed');
    expect(
      find.textContaining('₹400 of your deposit is coming back'),
      findsOneWidget,
    );
    await scrollTo(tester, find.byKey(const ValueKey('dispute-outcome')));
    expect(find.textContaining('Sajha decided: ₹600'), findsOneWidget);
  });

  testWidgets('lender marks a no-show from the first day', (tester) async {
    final t = await rental(tester, asLender: true);
    await go(tester, t.h, Routes.booking(t.booking.id));
    await tapKey(tester, 'booking-no-show');
    expect(find.text('Borrower didn’t show up?'), findsOneWidget);
    await tapKey(tester, 'reason-confirm');

    expect(t.booking.status, 'CANCELLED');
    expect(t.booking.cancelledBy, 'BORROWER');
    expect(find.textContaining('the borrower didn’t come'), findsOneWidget);
  });

  testWidgets('reviews are double-blind; the rating shows on the item', (
    tester,
  ) async {
    final t = await rental(tester);
    t.api
      ..handOverAs(t.booking.id)
      ..returnAs(t.booking.id)
      ..completeRental(t.booking.id);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(
      find.textContaining('₹1,000 of your deposit is coming back'),
      findsOneWidget,
    );

    await tapKey(tester, 'booking-review');
    final post = find.byKey(const ValueKey('review-submit'));
    expect(tester.widget<FilledButton>(post).onPressed, isNull);
    await tapKey(tester, 'star-4');
    await enterText(tester, 'review-comment', 'Clean tent, easy pickup.');
    await tapKey(tester, 'review-submit');
    expect(find.text('Thanks for your review'), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-review')), findsNothing);
    await scrollTo(tester, find.byKey(const ValueKey('review-mine')));
    expect(
      find.textContaining('Hidden until Asha reviews you'),
      findsOneWidget,
    );
    expect(find.text('Asha hasn’t reviewed you yet.'), findsOneWidget);

    // Asha reviews from her phone: both are published.
    t.api.reviewAs(t.booking.lenderId, t.booking.id, 5);
    await settle(tester);
    await scrollTo(tester, find.byKey(const ValueKey('review-theirs')));
    expect(find.text('Asha: ★★★★★'), findsOneWidget);
    expect(find.textContaining('Hidden until'), findsNothing);

    await go(tester, t.h, Routes.item(t.booking.listingId));
    await scrollTo(tester, find.byKey(const ValueKey('item-rating')));
    expect(find.text('Reviews · ★ 4.0 (1)'), findsOneWidget);
    await scrollTo(tester, find.textContaining('Clean tent, easy pickup.'));
    expect(find.textContaining('Clean tent, easy pickup.'), findsOneWidget);
    // The lender's own rating (from Rahul's review of Asha).
    expect(find.textContaining('★ 4.0 (1)'), findsWidgets);
  });

  testWidgets('report the other person from the booking', (tester) async {
    final t = await rental(tester);
    await go(tester, t.h, Routes.booking(t.booking.id));
    await tapKey(tester, 'booking-report');
    await tapText(tester, 'Scam or fraud');
    await tapKey(tester, 'report-submit');
    expect(find.text('Thanks. Sajha will look into it.'), findsOneWidget);
    expect(t.api.chat.reports.single, containsPair('targetType', 'USER'));
  });
}
