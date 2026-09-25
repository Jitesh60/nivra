import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/push/push_service.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';

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

  /// Asha lends a tent; Rahul (the app user) is a verified borrower.
  ({FakeSajhaApi api, String lender, String listing}) market({
    bool borrowerVerified = true,
  }) {
    final api = FakeSajhaApi();
    final lender = api.seedLender(name: 'Asha Patil', idVerified: true);
    final listing = api.seedListing(
      lenderId: lender,
      title: 'Quechua trekking tent',
    );
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

  String rahul(FakeSajhaApi api) => api.appUserId!;

  Future<void> openChat(
    WidgetTester tester,
    TestHarness h,
    String conversationId,
  ) async {
    h.container.read(routerProvider).push(Routes.chat(conversationId));
    await settle(tester);
  }

  Future<void> say(WidgetTester tester, String text) async {
    await enterText(tester, 'chat-input', text);
    await tester.tap(find.byKey(const ValueKey('send-message')));
    await settle(tester);
  }

  testWidgets('a guest taps Chat, signs in and lands in the chat', (
    tester,
  ) async {
    final m = market();
    m.api.seedSession(); // Rahul already has an account
    final h = TestHarness(api: m.api, prefs: FakeAppPrefs(seen: true));
    await h.start(tester);
    h.container.read(routerProvider).push(Routes.item(m.listing));
    await settle(tester);

    await tapKey(tester, 'chat-lender');
    expect(location(h), Routes.login);
    await enterText(tester, 'phone-input', '9876543210');
    await tester.tap(find.byKey(const ValueKey('consent')));
    await settle(tester, 2);
    await tapText(tester, 'Send code');
    await enterText(tester, 'otp-input', FakeSajhaApi.code);
    await settle(tester);
    await settle(tester);

    final conversation = m.api.chat.conversations.values.single;
    expect(location(h), Routes.chat(conversation.id));
    expect(find.text('Asha Patil'), findsOneWidget);
    expect(find.textContaining('Contact details stay hidden'), findsOneWidget);
    // Back goes to the item.
    await tester.pageBack();
    await settle(tester);
    expect(location(h), Routes.item(m.listing, chat: true));
  });

  testWidgets('without a verified email, Chat asks to verify it first', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api, emailVerified: false);
    h.container.read(routerProvider).push(Routes.item(m.listing));
    await settle(tester);
    await tapKey(tester, 'chat-lender');
    expect(find.text('Verify your email first'), findsOneWidget);
    expect(m.api.chat.conversations, isEmpty);
    await tapKey(tester, 'verify-email-now');
    expect(location(h), Routes.setupEmail);
  });

  testWidgets('messages go both ways live; contact details stay hidden', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    h.container.read(routerProvider).push(Routes.item(m.listing));
    await settle(tester);
    await tapKey(tester, 'chat-lender');
    final c = m.api.chat.conversations.values.single;
    expect(location(h), Routes.chat(c.id));
    expect(h.realtime.connected.value, isTrue);

    await say(tester, 'Hi! Is it free next weekend?');
    expect(find.text('Hi! Is it free next weekend?'), findsOneWidget);
    expect(c.messages.single.body, 'Hi! Is it free next weekend?');
    expect(
      find.byIcon(LucideIcons.check),
      findsOneWidget,
    ); // sent, not read yet

    // Asha types, then replies with her number: Rahul sees it hidden.
    m.api.typingAs(m.lender, c.id);
    await settle(tester, 2);
    expect(find.text('Asha is typing…'), findsOneWidget);
    m.api.sendAs(m.lender, c.id, 'Yes! Call me on 98765 43210');
    await settle(tester);
    expect(find.text('Yes! Call me on •••'), findsOneWidget);
    expect(
      find.text('Contact details are hidden until a booking is confirmed'),
      findsOneWidget,
    );
    expect(find.text('Asha is typing…'), findsNothing);
    // Opening it marks it read.
    expect(c.messages.last.readAt, isNotNull);

    // Asha reads Rahul's message: the tick turns into a read tick.
    m.api.readAs(m.lender, c.id);
    await settle(tester);
    expect(find.byKey(ValueKey('read-${c.messages.first.id}')), findsOneWidget);

    // Typing is sent (throttled).
    await enterText(tester, 'chat-input', 'Great');
    expect(h.realtime.typed, contains(c.id));
  });

  testWidgets('a failed send can be retried and is stored once', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final c = m.api.seedConversation(rahul(m.api), m.listing);
    await openChat(tester, h, c.id);

    m.api.chat.failNextSends = 1;
    await say(tester, 'Hello?');
    expect(find.text('Not sent. Tap to retry'), findsOneWidget);
    expect(c.messages, isEmpty);

    await tester.tap(find.text('Not sent. Tap to retry'));
    await settle(tester);
    expect(find.text('Not sent. Tap to retry'), findsNothing);
    expect(c.messages, hasLength(1));
    expect(find.text('Hello?'), findsOneWidget);
  });

  testWidgets('offer → counter-offer → accept agrees a deal', (tester) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final c = m.api.seedConversation(rahul(m.api), m.listing);
    await openChat(tester, h, c.id);

    // Rahul offers ₹120/day for 4 days.
    await tapKey(tester, 'make-offer');
    h.nextDates = DateTimeRange(start: day(5), end: day(8));
    await tapKey(tester, 'offer-dates');
    await enterText(tester, 'offer-price', '120');
    expect(find.textContaining('₹120 × 4 days = ₹480 rent'), findsOneWidget);
    await tapKey(tester, 'offer-submit');
    final first = c.offers.single;
    expect((first.price, first.days), (12000, 4));
    expect(find.text('Your offer'), findsOneWidget);
    expect(find.text('Waiting for a reply'), findsOneWidget);

    // Asha counters at ₹135: Rahul's offer shows as countered.
    m.api.offerAs(
      m.lender,
      c.id,
      start: c.offers.single.start,
      end: c.offers.single.end,
      pricePerDayPaise: 13500,
    );
    await settle(tester);
    expect(find.text('Countered'), findsOneWidget);
    expect(find.text('Asha’s offer'), findsOneWidget);
    expect(find.text('Your reply needed'), findsOneWidget);

    await tapKey(tester, 'offer-accept');
    expect(c.offers.last.status, 'ACCEPTED');
    expect(find.byKey(const ValueKey('deal-banner')), findsOneWidget);
    expect(find.textContaining('₹135/day'), findsWidgets);
    expect(find.textContaining('Offer accepted'), findsOneWidget);
    expect(find.byKey(const ValueKey('offer-accept')), findsNothing);
  });

  testWidgets('an offer can be countered from the card, or declined', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final c = m.api.seedConversation(rahul(m.api), m.listing);
    m.api.offerAs(
      m.lender,
      c.id,
      start: '2026-12-01',
      end: '2026-12-03',
      pricePerDayPaise: 15000,
    );
    await openChat(tester, h, c.id);

    // Counter: the sheet starts from the offer's dates and price.
    await tapKey(tester, 'offer-counter');
    expect(find.text('Counter-offer'), findsOneWidget);
    await enterText(tester, 'offer-price', '100');
    await tapKey(tester, 'offer-submit');
    expect(c.offers.first.status, 'COUNTERED');
    expect(c.offers.last.price, 10000);
    expect(c.offers.last.parentId, c.offers.first.id);

    // Asha offers again; Rahul declines.
    m.api.offerAs(
      m.lender,
      c.id,
      start: '2026-12-01',
      end: '2026-12-02',
      pricePerDayPaise: 14000,
    );
    await settle(tester);
    await tapKey(tester, 'offer-decline');

    expect(c.offers.last.status, 'DECLINED');
    // Tapping scrolled the list up; the note is just below the fold.
    expect(find.text('Offer declined', skipOffstage: false), findsOneWidget);
  });

  testWidgets('report and block from the chat menu', (tester) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final c = m.api.seedConversation(rahul(m.api), m.listing);
    m.api.sendAs(m.lender, c.id, 'Pay me on UPI instead');
    await openChat(tester, h, c.id);

    await tester.tap(find.byKey(const ValueKey('chat-menu')));
    await settle(tester);
    await tapText(tester, 'Report Asha');
    await tapKey(tester, 'reason-OFF_PLATFORM_PAYMENT');
    await enterText(tester, 'report-note', 'Wanted UPI outside the app');
    await tapKey(tester, 'report-submit');
    expect(m.api.chat.reports.single, {
      'targetType': 'USER',
      'targetId': m.lender,
      'reason': 'OFF_PLATFORM_PAYMENT',
      'note': 'Wanted UPI outside the app',
      'conversationId': c.id,
      'reporterId': rahul(m.api),
    });
    expect(find.text('Thanks. Our team will take a look.'), findsOneWidget);

    // Long-press a message to report it.
    await tester.longPress(find.text('Pay me on UPI instead'));
    await settle(tester);
    await tapKey(tester, 'reason-SCAM');
    await tapKey(tester, 'report-submit');
    expect(m.api.chat.reports.last['targetType'], 'MESSAGE');

    await tester.tap(find.byKey(const ValueKey('chat-menu')));
    await settle(tester);
    await tapText(tester, 'Block');
    await tapKey(tester, 'confirm-block');
    expect(m.api.chat.blocks, contains('${rahul(m.api)}|${m.lender}'));
    expect(find.byKey(const ValueKey('blocked-notice')), findsOneWidget);
    expect(find.byKey(const ValueKey('chat-input')), findsNothing);

    await tapKey(tester, 'unblock');
    expect(m.api.chat.blocks, isEmpty);
    expect(find.byKey(const ValueKey('chat-input')), findsOneWidget);
  });

  testWidgets('photos are uploaded and sent', (tester) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final c = m.api.seedConversation(rahul(m.api), m.listing);
    await openChat(tester, h, c.id);
    await tapKey(tester, 'send-photo');
    expect(c.messages.single.type, 'IMAGE');
    expect(m.api.storagePuts, hasLength(1));
    expect(h.api.requests, contains('POST /uploads'));
  });

  testWidgets('a new message updates the badge and inbox; reading clears it', (
    tester,
  ) async {
    final m = market();
    final h = await signedIn(tester, m.api);
    final c = m.api.seedConversation(rahul(m.api), m.listing);
    m.api.sendAs(rahul(m.api), c.id, 'Hi Asha');
    await settle(tester);
    expect(find.byKey(const ValueKey('inbox-badge')), findsNothing);

    m.api.sendAs(m.lender, c.id, 'Hi Rahul, yes it is free');
    await settle(tester);
    expect(
      tester.widget<Text>(find.byKey(const ValueKey('inbox-badge'))).data,
      '1',
    );

    await tapKey(tester, 'open-inbox');
    expect(location(h), Routes.inbox);
    expect(find.text('Hi Rahul, yes it is free'), findsOneWidget);
    expect(find.byKey(ValueKey('unread-${c.id}')), findsOneWidget);

    await tapKey(tester, 'conversation-${c.id}');
    expect(location(h), Routes.chat(c.id));
    await tester.pageBack();
    await settle(tester);
    expect(find.byKey(ValueKey('unread-${c.id}')), findsNothing);
    await tester.pageBack();
    await settle(tester);
    expect(find.byKey(const ValueKey('inbox-badge')), findsNothing);
  });

  testWidgets(
    'push: the device registers after sign-in; a tap opens the chat',
    (tester) async {
      final m = market();
      final h = await signedIn(tester, m.api);
      expect(h.push.registrations, 1);
      expect(m.api.chat.pushTokens, {'fcm-test-token': 'android'});

      final c = m.api.seedConversation(rahul(m.api), m.listing);
      h.push.openedController.add(PushOpen(conversationId: c.id));
      await settle(tester);
      expect(location(h), Routes.chat(c.id));
    },
  );

  testWidgets('guests are not connected and have no inbox', (tester) async {
    final m = market();
    final h = TestHarness(api: m.api, prefs: FakeAppPrefs(seen: true));
    await h.start(tester);
    expect(h.realtime.connected.value, isFalse);
    expect(h.push.registrations, 0);
    expect(find.byKey(const ValueKey('open-inbox')), findsNothing);
    h.container.read(routerProvider).go(Routes.inbox);
    await settle(tester);
    expect(location(h), Routes.login);
  });
}
