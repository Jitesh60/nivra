import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/payments/payment_gateway.dart';
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

  String iso(int fromToday) {
    final now = DateTime.now();
    return isoDate(DateTime(now.year, now.month, now.day + fromToday));
  }

  Future<void> go(WidgetTester tester, TestHarness h, String route) async {
    h.container.read(routerProvider).push(route);
    await settle(tester);
  }

  Future<String> statusText(WidgetTester tester) async {
    final chip = find.byKey(const ValueKey('booking-status'));
    if (chip.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        chip,
        -300,
        scrollable: find.byType(Scrollable).hitTestable().last,
      );
    }
    return (tester.widget<Text>(
      find.descendant(of: chip, matching: find.byType(Text)),
    )).data!;
  }

  /// Rahul (the app user) has a booking of Asha's tent, accepted and
  /// waiting for payment, starting in [startIn] days.
  Future<({TestHarness h, FakeSajhaApi api, FakeBooking booking})> awaiting(
    WidgetTester tester, {
    int startIn = 10,
    String provider = 'fake',
    bool asLender = false,
  }) async {
    final api = FakeSajhaApi()..payments.provider = provider;
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
      end: iso(startIn + 2),
      status: 'AWAITING_PAYMENT',
    );
    return (h: h, api: api, booking: booking);
  }

  testWidgets('pay with the test checkout → confirming → booked, with the '
      'pickup address', (tester) async {
    final t = await awaiting(tester);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(find.textContaining('Pay to confirm'), findsOneWidget);
    expect(find.text('Pay ₹1,450'), findsOneWidget);
    expect(find.byKey(const ValueKey('booking-pickup')), findsNothing);

    await tapKey(tester, 'booking-pay');
    expect(find.byKey(const ValueKey('test-checkout')), findsOneWidget);
    expect(find.text('Quechua trekking tent'), findsWidgets);
    await tapKey(tester, 'test-pay-success');

    // Verify confirms it at once.
    expect(location(t.h), Routes.bookingPaying(t.booking.id));
    expect(find.text('You’re booked!'), findsOneWidget);
    expect(t.booking.status, 'CONFIRMED');
    expect(t.api.requests, contains('POST /payments/verify'));

    await tapKey(tester, 'paying-done');
    expect(location(t.h), Routes.booking(t.booking.id));
    expect(await statusText(tester), 'Confirmed');
    expect(find.byKey(const ValueKey('booking-pay')), findsNothing);
    expect(find.textContaining('Shanti Apartments'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('booking-paid')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().last,
    );
    expect(find.textContaining('Paid'), findsWidgets);
    expect(find.textContaining('upi'), findsOneWidget);
    expect(find.text('Paid: booking confirmed'), findsOneWidget);

    // The webhook arriving afterwards changes nothing.
    t.api.deliverCaptured(t.api.orderFor(t.booking.id)!.orderId);
    await settle(tester);
    expect(t.api.payments.transfers, hasLength(1));
  });

  testWidgets('a failed payment says why and can be tried again', (
    tester,
  ) async {
    final t = await awaiting(tester);
    await go(tester, t.h, Routes.booking(t.booking.id));

    await tapKey(tester, 'booking-pay');
    await tapKey(tester, 'test-pay-fail');
    expect(
      find.text('Your bank declined this payment (test).'),
      findsOneWidget,
    );
    expect(t.booking.status, 'AWAITING_PAYMENT');

    await tapKey(tester, 'pay-retry');
    await tapKey(tester, 'test-pay-success');
    expect(find.text('You’re booked!'), findsOneWidget);
    // The failed order is reused, not a second one.
    expect(t.api.payments.orders, hasLength(1));
    expect(t.booking.status, 'CONFIRMED');
  });

  testWidgets('closing the checkout leaves the booking waiting', (
    tester,
  ) async {
    final t = await awaiting(tester);
    await go(tester, t.h, Routes.booking(t.booking.id));

    await tapKey(tester, 'booking-pay');
    await tester.tapAt(const Offset(20, 20)); // Outside the sheet.
    await settle(tester);
    expect(location(t.h), Routes.booking(t.booking.id));
    expect(find.byKey(const ValueKey('booking-pay')), findsOneWidget);
    expect(t.booking.status, 'AWAITING_PAYMENT');
  });

  testWidgets('with Razorpay, the SDK checkout is opened for the order', (
    tester,
  ) async {
    final t = await awaiting(tester, provider: 'razorpay');
    await go(tester, t.h, Routes.booking(t.booking.id));

    // Cancelled in the SDK: nothing happens.
    t.h.gateway.next = const CheckoutCancelled();
    await tapKey(tester, 'booking-pay');
    expect(location(t.h), Routes.booking(t.booking.id));
    expect(find.byKey(const ValueKey('test-checkout')), findsNothing);

    // A forged signature is refused by the API.
    t.h.gateway.next = CheckoutSuccess(
      orderId: t.h.gateway.opened.single.orderId,
      paymentId: 'pay_x',
      signature: 'forged',
    );
    await tapKey(tester, 'booking-pay');
    expect(find.text('We couldn’t confirm this payment'), findsOneWidget);
    expect(t.booking.status, 'AWAITING_PAYMENT');
    await tapKey(tester, 'paying-done');

    // Paid in the SDK.
    t.h.gateway.next = null;
    await tapKey(tester, 'booking-pay');
    final request = t.h.gateway.opened.last;
    expect(request.keyId, 'rzp_test_fake');
    expect(request.amountPaise, 145000);
    expect(request.contact, '+919876543210');
    expect(find.text('You’re booked!'), findsOneWidget);
    expect(t.booking.status, 'CONFIRMED');
  });

  testWidgets('if verify can’t get through, the webhook still confirms it', (
    tester,
  ) async {
    final t = await awaiting(tester, provider: 'razorpay');
    await go(tester, t.h, Routes.booking(t.booking.id));

    // The connection drops right after the SDK says it's paid.
    t.h.gateway.next = null;
    t.api.offlineFor.add('POST /payments/verify');
    await tapKey(tester, 'booking-pay');
    expect(find.text('Confirming your payment…'), findsOneWidget);

    t.api.deliverCaptured(t.h.gateway.opened.single.orderId);
    await settle(tester);
    expect(find.text('You’re booked!'), findsOneWidget);
  });

  testWidgets('cancelling a paid booking shows the refund first', (
    tester,
  ) async {
    final t = await awaiting(tester, startIn: 0);
    t.api.payAs(t.booking.id);
    await go(tester, t.h, Routes.booking(t.booking.id));
    expect(await statusText(tester), 'Confirmed');

    await tapKey(tester, 'booking-cancel');
    // Under 24 hours before pickup: only the deposit comes back.
    expect(
      find.textContaining('you get the deposit back, ₹1000'),
      findsOneWidget,
    );
    await enterText(tester, 'reason-field', 'Trip called off');
    await tapKey(tester, 'reason-confirm');

    expect(t.booking.status, 'CANCELLED');
    expect(
      find.text('Booking cancelled. Any refund is on its way.'),
      findsOneWidget,
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('booking-refund-0')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().last,
    );
    expect(find.text('Cancellation refund · On the way'), findsOneWidget);
    expect(find.text('− ₹1,000'), findsOneWidget);
    expect(t.api.payments.transfers.single.status, 'REVERSED');
  });

  testWidgets('lender: earnings wait for a bank account, set up payouts', (
    tester,
  ) async {
    final t = await awaiting(tester, asLender: true);
    t.api.payAs(t.booking.id);

    await go(tester, t.h, Routes.profile);
    await tapKey(tester, 'open-earnings');
    expect(location(t.h), Routes.earnings);
    expect(find.text('Set up payouts'), findsOneWidget);
    // ₹150 × 3 days, less 10%.
    expect(find.text('₹405 is waiting for your bank account.'), findsOneWidget);
    expect(find.textContaining('Waiting for your bank account'), findsWidgets);

    await tapKey(tester, 'open-payouts');
    await enterText(tester, 'payout-name', 'Asha Patil');
    await enterText(tester, 'payout-account', '50100123456789');
    await enterText(tester, 'payout-account-again', '50100123456788');
    await enterText(tester, 'payout-ifsc', 'hdfc0001234');
    await enterText(tester, 'payout-pan', 'abcde1234f');
    await enterText(tester, 'payout-street', '12 FC Road');
    await enterText(tester, 'payout-city', 'Pune');
    await enterText(tester, 'payout-state', 'Maharashtra');
    await enterText(tester, 'payout-pin', '411004');
    await tapKey(tester, 'payout-save');
    expect(find.text('The account numbers don’t match'), findsOneWidget);
    expect(t.api.payments.accounts, isEmpty);

    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('payout-account-again')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await enterText(tester, 'payout-account-again', '50100123456789');
    await tapKey(tester, 'payout-save');
    expect(find.text('Bank account added'), findsOneWidget);
    expect(find.text('Being verified'), findsOneWidget);
    expect(find.text('•••• 6789'), findsOneWidget);
    expect(find.text('HDFC0001234'), findsOneWidget);
    final saved = t.api.payments.accounts.values.single;
    expect(saved['panLast4'], '234F');

    // Razorpay activates it; the held payout goes out on hold.
    t.api.setAccountStatus(
      t.api.bookingState.bookings.values.single.lenderId,
      'ACTIVATED',
    );
    await tester.pageBack();
    await settle(tester);
    await tester.fling(
      find.byType(Scrollable).first,
      const Offset(0, 400),
      1000,
    );
    await settle(tester, 20);
    expect(find.textContaining('Held until the item is back'), findsOneWidget);
    expect(find.text('Active'), findsOneWidget);
  });
}
