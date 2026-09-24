// Contract test against a running Sajha API (skipped by default).
//
//   # API started with OTP_DEV_BYPASS_CODE=000000
//   flutter test test/live_api_test.dart --dart-define=LIVE_API_URL=http://localhost:3000
//
// Uses the real AuthRepository, TokenManager and interceptor over real HTTP,
// so it catches any drift between the app's models and the API.
import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/network/api_exception.dart';
import 'package:sajha/core/network/auth_interceptor.dart';
import 'package:sajha/core/network/token_manager.dart';
import 'package:sajha/core/network/upload_client.dart';
import 'package:sajha/core/realtime/realtime_client.dart';
import 'package:sajha/features/bookings/data/bookings_repository.dart';
import 'package:sajha/features/bookings/data/models.dart';
import 'package:sajha/features/chat/data/chat_repository.dart';
import 'package:sajha/features/chat/data/models.dart';
import 'package:sajha/features/auth/data/auth_repository.dart';
import 'package:sajha/features/discovery/application/search_area.dart';
import 'package:sajha/features/discovery/data/discovery_repository.dart';
import 'package:sajha/features/discovery/data/models.dart';
import 'package:sajha/features/documents/data/documents_repository.dart';
import 'package:sajha/features/documents/data/models.dart';
import 'package:sajha/features/listings/data/listings_repository.dart';
import 'package:sajha/features/listings/data/models.dart' as listing;
import 'package:sajha/features/payments/data/models.dart';
import 'package:sajha/features/payments/data/payments_repository.dart';
import 'package:sajha/core/network/upload_client.dart' as up;
import 'package:sajha/features/rentals/data/rentals_repository.dart';
import 'package:sajha/core/payments/payment_gateway.dart';
import 'package:sajha/features/profile/data/profile_repository.dart';

import 'helpers/fakes.dart';

const liveUrl = String.fromEnvironment('LIVE_API_URL');

/// For the payment test: a LIVE listing and its lender's phone (10 digits),
/// e.g. seeded locally. The lender accepts from here.
const liveListingId = String.fromEnvironment('LIVE_LISTING_ID');
const liveLenderPhone = String.fromEnvironment('LIVE_LENDER_PHONE');
const bypassCode = String.fromEnvironment(
  'LIVE_OTP_CODE',
  defaultValue: '000000',
);

/// A real 32×20 JPEG: the API decodes and re-encodes every upload.
final _jpeg = Uint8List.fromList(
  base64Decode(
    '/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEEx'
    'NDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7'
    'Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAUACADASIAAhEBAxEB/8QA'
    'FQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAA'
    'AAAAAAAAAAAAAAMG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AiAqxYAAA'
    'AAD/2Q==',
  ),
);

void main() {
  test('full sign-in lifecycle against the real API', () async {
    Dio dio() => Dio(BaseOptions(baseUrl: '$liveUrl/v1'));
    final storage = InMemorySessionStorage();
    final tokens = TokenManager(dio: dio(), store: storage);
    final api = dio();
    api.interceptors.add(AuthInterceptor(tokens, api));
    final repo = AuthRepository(
      dio: api,
      tokens: tokens,
      store: storage,
      device: FakeDeviceInfo(),
    );

    final random = Random();
    final phone = '9${List.generate(9, (_) => random.nextInt(10)).join()}';

    // Phone OTP → new user.
    final challenge = await repo.requestPhoneOtp(phone);
    expect(challenge.resendAfterSec, 30);
    final login = await repo.verifyPhoneOtp(challenge.challengeId, bypassCode);
    expect(login.isNewUser, isTrue);
    expect(login.user.phone, '+91$phone');
    expect(login.user.phoneVerified, isTrue);
    expect(storage.refreshToken, isNotNull);

    // Profile + email.
    expect((await repo.updateName('Live Test')).name, 'Live Test');
    final email = 'live.$phone@example.com';
    final emailChallenge = await repo.requestEmailOtp(email);
    final verified = await repo.verifyEmailOtp(
      emailChallenge.challengeId,
      bypassCode,
    );
    expect(verified.email, email);
    expect(verified.emailVerified, isTrue);

    // Sessions.
    final sessions = await repo.sessions();
    expect(sessions.single.current, isTrue);
    expect(sessions.single.deviceName, 'Pixel 8');

    // Restart: restore the stored session with a refresh.
    final restored = await AuthRepository(
      dio: api,
      tokens: tokens,
      store: storage,
      device: FakeDeviceInfo(),
    ).restoreSession();
    expect(restored?.id, login.user.id);

    // Error shape round-trips.
    await expectLater(
      repo.requestPhoneOtp(phone),
      throwsA(
        isA<ApiException>().having((e) => e.code, 'code', 'OTP_COOLDOWN'),
      ),
    );

    // Profile + photo: presigned PUT to real storage, then finalise.
    final uploads = UploadClient(api: api, storage: Dio());
    final profile = ProfileRepository(dio: api, uploads: uploads);
    final edited = await profile.update(city: 'Pune', bio: 'Live test bio');
    expect((edited.city, edited.bio), ('Pune', 'Live test bio'));
    final progress = <double>[];
    final withPhoto = await profile.setAvatar(_jpeg, onProgress: progress.add);
    expect(progress, isNotEmpty);
    final photo = await Dio().get<List<int>>(
      withPhoto.avatarUrl!,
      options: Options(responseType: ResponseType.bytes),
    );
    expect(photo.headers.value('content-type'), 'image/webp');
    expect((await profile.removeAvatar()).avatarUrl, isNull);

    // Document vault.
    final documents = DocumentsRepository(dio: api, uploads: uploads);
    final doc = await documents.add(type: DocumentType.pan, front: _jpeg);
    expect(doc.status, DocumentStatus.pending);
    expect((await documents.list()).single.id, doc.id);
    final view = await Dio().get<List<int>>(
      await documents.viewUrl(doc.id, DocumentSide.front),
      options: Options(responseType: ResponseType.bytes),
    );
    expect(view.headers.value('content-type'), 'image/jpeg');
    await expectLater(
      documents.add(type: DocumentType.pan, front: _jpeg),
      throwsA(
        isA<ApiException>().having(
          (e) => e.code,
          'code',
          'DOCUMENT_ALREADY_EXISTS',
        ),
      ),
    );
    await documents.delete(doc.id);
    expect(await documents.list(), isEmpty);

    // Listings: categories and rules, draft → photo → publish (first one is
    // reviewed), then delete.
    final listings = ListingsRepository(dio: api, uploads: uploads);
    final categories = await listings.categories();
    expect(categories.map((c) => c.slug), contains('trekking-outdoor'));
    final rules = await listings.rules();
    expect(rules.lenderEarnings(15000), 13500);
    final draft = await listings.create({
      'categoryId': categories.first.id,
      'title': 'Live test trekking tent',
      'description': 'Created by the mobile live contract test.',
      'condition': 'GOOD',
      'pricePerDayPaise': 15000,
      'depositPaise': 100000,
      'lat': 18.5074,
      'lng': 73.8077,
      'areaLabel': 'Kothrud, Pune',
      'exactAddress': 'Flat 1, Test Lane',
    });
    expect(draft.status, listing.ListingStatus.draft);
    expect(draft.exactAddress, 'Flat 1, Test Lane');
    final photographed = await listings.addPhoto(draft.id, _jpeg);
    expect(photographed.photos.single.thumbUrl, endsWith('-thumb.webp'));
    await listings.setBlocks(draft.id, [
      listing.BlockedRange(
        DateTime.now().add(const Duration(days: 10)),
        DateTime.now().add(const Duration(days: 12)),
      ),
    ]);
    final withDocs = await listings.setRequiredDocs(draft.id, const [
      listing.RequiredDoc(listing.RequiredDocType.governmentId),
    ]);
    expect(withDocs.blocks, hasLength(1));
    final published = await listings.publish(draft.id);
    expect(published.inReview, isTrue);
    expect(published.listing.status, listing.ListingStatus.pending);
    expect((await listings.mine()).single.id, draft.id);
    await listings.delete(draft.id);
    expect(await listings.mine(), isEmpty);

    // Wishlist, signed in: save someone else's live listing, then remove it.
    final discovery = DiscoveryRepository(api);
    expect(await discovery.wishlist(), isEmpty);
    final anyLive = (await discovery.search(const SearchFilters())).items;
    if (anyLive.isNotEmpty) {
      final id = anyLive.first.id;
      await discovery.save(id);
      await discovery.save(id); // idempotent
      final saved = await discovery.wishlist();
      expect(saved.single.id, id);
      expect(saved.single.saved, isTrue);
      expect((await discovery.listing(id)).saved, isTrue);
      await discovery.unsave(id);
      expect(await discovery.wishlist(), isEmpty);
    }
    await expectLater(
      discovery.save(draft.id), // deleted: not saveable
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 404)),
    );

    // Chat over the real socket: open a chat on someone else's live listing,
    // write with a phone number in it, and make an offer. The sender gets
    // each message back live, with their own (unmasked) text.
    if (anyLive.isNotEmpty) {
      final chat = ChatRepository(dio: api, uploads: uploads);
      final socket = SocketRealtimeClient(url: '$liveUrl/ws', tokens: tokens);
      final events = <RealtimeEvent>[];
      final sub = socket.events.listen(events.add);
      socket.connect();
      await _until(() => socket.connected.value);

      final conversation = await chat.start(anyLive.first.id);
      expect(conversation.isBorrower, isTrue);
      expect((await chat.start(anyLive.first.id)).id, conversation.id);
      final sent = await chat.sendText(
        conversation.id,
        'Call me on 98765 43210',
        'live-1',
      );
      expect(sent.body, 'Call me on 98765 43210');
      expect(sent.masked, isTrue);
      await _until(
        () => events.any((e) => e.name == RealtimeEvents.messageNew),
      );
      final live = ChatMessage.fromJson(
        events.firstWhere((e) => e.name == RealtimeEvents.messageNew).data,
      );
      expect(
        (live.id, live.mine, live.body),
        (sent.id, true, 'Call me on 98765 43210'),
      );

      // Random, so reruns against the same database don't collide.
      final start = DateTime.now().add(
        Duration(days: 20 + Random().nextInt(300)),
      );
      final offerMessage = await chat.makeOffer(
        conversation.id,
        start: start,
        end: start.add(const Duration(days: 1)),
        pricePerDayPaise: anyLive.first.pricePerDayPaise,
      );
      expect(offerMessage.offer!.status, OfferStatus.pending);
      expect(offerMessage.offer!.mine, isTrue);
      final own = await chat
          .accept(offerMessage.offer!.id)
          .then<Object?>((_) => null, onError: (Object e) => e);
      expect((own! as ApiException).code, 'OFFER_OWN');

      final inbox = await chat.inbox();
      expect(inbox.items.first.id, conversation.id);
      expect(inbox.items.first.pendingOffer?.id, offerMessage.offer!.id);
      await chat.registerPushToken(
        'live-test-token-${DateTime.now().millisecondsSinceEpoch}',
        'android',
      );

      // Request to book the same item: the booking page, lists and the
      // bell parse, and the socket sends the change back. Cancelled after,
      // since an account with a booking in progress can't be deleted.
      final item = await discovery.listing(anyLive.first.id);
      final from = DateTime.now().add(
        Duration(days: item.advanceNoticeDays + 30),
      );
      final dates = listing.BlockedRange(
        from,
        from.add(Duration(days: item.minDays.clamp(1, 7) - 1)),
      );
      final quote = await discovery.quote(item.id, dates);
      if (quote.available) {
        final bookings = BookingsRepository(dio: api);
        final requested = await bookings.request(
          listingId: item.id,
          start: dates.start,
          end: dates.end,
        );
        final b = requested.booking;
        expect(b.status, BookingStatus.requested);
        expect(b.isBorrower, isTrue);
        expect(b.totalPaise, quote.totalPaise);
        expect(requested.can.cancel, isTrue);
        expect(requested.can.accept, isFalse);
        expect(requested.events.single.type, BookingEventType.requested);
        expect(
          requested.requiredDocs.map((d) => d.type),
          item.requiredDocs.map((d) => d.type),
        );
        await _until(
          () => events.any(
            (e) =>
                e.name == RealtimeEvents.bookingUpdated && e.data['id'] == b.id,
          ),
        );
        final again = await bookings
            .request(listingId: item.id, start: dates.start, end: dates.end)
            .then<Object?>((_) => null, onError: (Object e) => e);
        expect((again! as ApiException).code, 'BOOKING_OPEN_EXISTS');
        final open = await bookings.list(
          BookingRole.borrower,
          BookingScope.open,
        );
        expect(open.items.first.id, b.id);
        expect((await chat.conversation(b.conversationId)).openBookingId, b.id);

        // Not payable until the lender accepts; nothing to refund yet.
        final payments = PaymentsRepository(dio: api);
        final early = await payments
            .checkout(b.id)
            .then<Object?>((_) => null, onError: (Object e) => e);
        expect((early! as ApiException).code, 'PAYMENT_NOT_ALLOWED');
        final preview = await bookings.cancelPreview(b.id);
        expect((preview.refundPaise, preview.tier), (0, null));
        expect(requested.payment, isNull);
        expect(requested.pickupAddress, isNull);
        expect(requested.can.pay, isFalse);

        final cancelled = await bookings.cancel(b.id, 'Live test, sorry!');
        expect(cancelled.booking.status, BookingStatus.cancelled);
        expect(cancelled.booking.cancelledBy, 'BORROWER');
        final past = await bookings.list(
          BookingRole.borrower,
          BookingScope.past,
        );
        expect(past.items.first.id, b.id);
        final bell = await bookings.notifications();
        expect(bell.unread, bell.items.where((n) => n.unread).length);
        await bookings.markNotificationsRead();
        expect(await bookings.unreadNotifications(), 0);
      }

      await sub.cancel();
      socket.disconnect();
    }

    // Payouts: none yet, a bad IFSC is refused, then set up (the account
    // goes away with the user below).
    final payouts = PaymentsRepository(dio: api);
    expect(await payouts.payoutAccount(), isNull);
    final empty = await payouts.earnings();
    expect(empty.account, isNull);
    expect(empty.items, isEmpty);
    expect(empty.onHoldPaise, 0);
    const bank = PayoutAccountInput(
      beneficiaryName: 'Live Test',
      accountNumber: '50100123456789',
      ifsc: 'hdfc0001234',
      pan: 'abcde1234f',
      email: 'live@example.com',
      street: '12 FC Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411004',
    );
    final badBank = await payouts
        .setUpPayouts(
          const PayoutAccountInput(
            beneficiaryName: 'Live Test',
            accountNumber: '50100123456789',
            ifsc: 'HDFC1234',
            pan: 'ABCDE1234F',
            email: 'live@example.com',
            street: '12 FC Road',
            city: 'Pune',
            state: 'Maharashtra',
            postalCode: '411004',
          ),
        )
        .then<Object?>((_) => null, onError: (Object e) => e);
    expect((badBank! as ApiException).code, 'VALIDATION_FAILED');
    final account = await payouts.setUpPayouts(bank);
    expect(account.bankLast4, '6789');
    expect(account.ifsc, 'HDFC0001234');
    expect(account.panLast4, '234F');
    expect((await payouts.payoutAccount())?.status, account.status);

    // Delete the account so the test leaves nothing behind.
    await repo.deleteAccount();
    expect(storage.refreshToken, isNull);
    await expectLater(tokens.refresh(), completion(isNull));
  }, skip: liveUrl.isEmpty ? 'Set --dart-define=LIVE_API_URL to run' : false);

  test(
    'pays for a booking through the test checkout',
    () async {
      final borrower = await _signIn(_randomPhone(), verifyEmail: true);
      final lender = await _signIn(liveLenderPhone);
      final bookings = BookingsRepository(dio: borrower.api);
      final lenderBookings = BookingsRepository(dio: lender.api);
      final payments = PaymentsRepository(dio: borrower.api);

      final item = await DiscoveryRepository(borrower.api)
          .listing(liveListingId);
      final from = DateTime.now().add(
        Duration(days: item.advanceNoticeDays + 40 + Random().nextInt(200)),
      );
      final requested = await bookings.request(
        listingId: item.id,
        start: from,
        end: from.add(Duration(days: item.minDays.clamp(1, 7) - 1)),
      );
      final b = requested.booking;
      final accepted = await lenderBookings.accept(b.id);
      if (accepted.booking.status == BookingStatus.awaitingDocs) {
        await bookings.cancel(b.id, 'Live test: listing asks for documents');
        markTestSkipped(
          'LIVE_LISTING_ID asks for documents; use one that '
          'doesn’t',
        );
        return;
      }
      expect(accepted.booking.status, BookingStatus.awaitingPayment);
      expect((await bookings.get(b.id)).can.pay, isTrue);

      // The order, then a failed attempt, then a paid one (same order).
      final order = await payments.checkout(b.id);
      expect(
        order.provider,
        'fake',
        reason: 'run the API with the fake provider',
      );
      expect(order.amountPaise, b.totalPaise);
      expect(order.contact, startsWith('+91'));
      expect(
        await payments.testCheckout(order.orderId, succeed: false),
        isA<CheckoutFailure>(),
      );
      final again = await payments.checkout(b.id);
      expect(again.orderId, order.orderId);
      final paid = await payments.testCheckout(order.orderId, succeed: true);
      expect(await payments.verify(paid as CheckoutSuccess), 'CONFIRMED');

      final confirmed = await bookings.get(b.id);
      expect(confirmed.booking.status, BookingStatus.confirmed);
      expect(confirmed.payment?.status, PaymentStatus.captured);
      expect(confirmed.payment?.amountPaise, b.totalPaise);
      expect(confirmed.pickupAddress, isNotNull);
      expect(confirmed.can.pay, isFalse);
      expect(confirmed.events.last.type, BookingEventType.paid);
      final lenderView = await lenderBookings.get(b.id);
      expect(lenderView.pickupAddress, isNull);
      expect(lenderView.payment?.status, PaymentStatus.captured);
      final earnings = await PaymentsRepository(dio: lender.api).earnings();
      expect(earnings.items.first.bookingId, b.id);

      // Cancelled long before pickup: everything comes back.
      final preview = await bookings.cancelPreview(b.id);
      expect((preview.tier, preview.refundPaise), ('FULL', b.totalPaise));
      final cancelled = await bookings.cancel(b.id, 'Live test, sorry!');
      expect(cancelled.booking.status, BookingStatus.cancelled);
      await _until(() async {
        final p = (await bookings.get(b.id)).payment;
        return p?.status == PaymentStatus.refunded && p!.refunds.isNotEmpty;
      });
      final refunded = (await bookings.get(b.id)).payment!;
      expect(refunded.refunds.single.kind, RefundKind.cancellation);
      expect(refunded.refundedPaise, b.totalPaise);

      await borrower.repo.deleteAccount();
    },
    skip: liveUrl.isEmpty || liveListingId.isEmpty || liveLenderPhone.isEmpty
        ? 'Set LIVE_API_URL, LIVE_LISTING_ID and LIVE_LENDER_PHONE to run'
        : false,
  );

  test(
    'rents it out: handover and return with codes and photos',
    () async {
      final borrower = await _signIn(_randomPhone(), verifyEmail: true);
      final lender = await _signIn(liveLenderPhone);
      final bookings = BookingsRepository(dio: borrower.api);
      final payments = PaymentsRepository(dio: borrower.api);
      RentalsRepository rentals(Dio api) => RentalsRepository(
        dio: api,
        uploads: up.UploadClient(api: api, storage: Dio()),
      );
      final item = await DiscoveryRepository(borrower.api)
          .listing(liveListingId);

      // The handover opens the day before the start: book a day that's close.
      BookingDetail? requested;
      for (final offset in [
        item.advanceNoticeDays,
        item.advanceNoticeDays + 1,
      ]) {
        final day = DateTime.now().add(Duration(days: offset));
        try {
          requested = await bookings.request(
            listingId: item.id,
            start: day,
            end: day.add(Duration(days: item.minDays - 1)),
          );
          break;
        } on ApiException catch (e) {
          if (e.code != 'BOOKING_DATES_UNAVAILABLE') rethrow;
        }
      }
      if (requested == null) {
        markTestSkipped('The next days are booked on LIVE_LISTING_ID');
        return;
      }
      final id = requested.booking.id;
      await BookingsRepository(dio: lender.api).accept(id);
      final order = await payments.checkout(id);
      final sheet = await payments.testCheckout(order.orderId, succeed: true);
      await payments.verify(sheet as CheckoutSuccess);

      // Handover: the borrower's code, the lender's photos.
      final handoverCode = await rentals(borrower.api).code(id);
      expect(handoverCode.stage, RentalStage.handover);
      expect(codeFromQr(handoverCode.qr, bookingId: id), handoverCode.code);
      final wrong = await rentals(lender.api)
          .handOver(
            id,
            code: '000000' == handoverCode.code ? '111111' : '000000',
            photos: [_jpeg, _jpeg],
          )
          .then<Object?>((_) => null, onError: (Object e) => e);
      expect((wrong! as ApiException).code, 'BOOKING_CODE_INVALID');
      final active = await rentals(lender.api).handOver(
        id,
        code: handoverCode.code,
        photos: [_jpeg, _jpeg],
        note: 'Live test handover',
      );
      expect(active.booking.status, BookingStatus.active);
      expect(active.rental?.handedOverAt, isNotNull);
      expect(active.conditionReports.single.photos, hasLength(2));
      final photo = await Dio().get<List<int>>(
        active.conditionReports.single.photos.first.thumbUrl,
        options: Options(responseType: ResponseType.bytes),
      );
      expect(photo.headers.value('content-type'), 'image/webp');

      // Return: the lender's code, the borrower's photos.
      final returnCode = await rentals(lender.api).code(id);
      expect(returnCode.stage, RentalStage.returned);
      final back = await rentals(borrower.api)
          .returnItem(id, code: returnCode.code, photos: [_jpeg, _jpeg]);
      expect(back.booking.status, BookingStatus.returned);
      expect(back.rental?.claimUntil, isNotNull);
      expect(back.rental?.lateFeePaise, 0);
      expect(back.conditionReports.map((r) => r.stage), [
        RentalStage.handover,
        RentalStage.returned,
      ]);
      final lenderView = await BookingsRepository(dio: lender.api).get(id);
      expect(lenderView.can.dispute, isTrue);
      expect(lenderView.can.addPhotos, isTrue);
      // Reviews come after completion (24 h after the return).
      expect(back.can.review, isFalse);
      final itemReviews = await rentals(borrower.api).listingReviews(item.id);
      expect(itemReviews.ratingCount, greaterThanOrEqualTo(0));
    },
    skip: liveUrl.isEmpty || liveListingId.isEmpty || liveLenderPhone.isEmpty
        ? 'Set LIVE_API_URL, LIVE_LISTING_ID and LIVE_LENDER_PHONE to run'
        : false,
  );

  test('guests browse: home, search, a listing and its quote', () async {
    final discovery = DiscoveryRepository(
      Dio(BaseOptions(baseUrl: '$liveUrl/v1')),
    );
    const pune = SearchArea(
      lat: 18.5074,
      lng: 73.8077,
      label: 'Current location',
      radiusKm: 25,
    );
    final home = await discovery.home(area: pune);
    expect(home.categories, isNotEmpty);

    final nearby = await discovery.search(const SearchFilters(), area: pune);
    expect(nearby.sort, SearchSort.distance);
    for (final c in nearby.items) {
      expect(c.distanceKm, lessThanOrEqualTo(25));
      expect(c.saved, isFalse); // guests have no wishlist
    }

    final everywhere = await discovery.search(
      const SearchFilters(sort: SearchSort.newest),
    );
    if (everywhere.items.isEmpty) return; // Nothing live on this server yet.
    final card = everywhere.items.first;
    final detail = await discovery.listing(card.id);
    expect(detail.title, card.title);
    expect(detail.photos, isNotEmpty);

    final start = DateTime.now().add(
      Duration(days: detail.advanceNoticeDays + 1),
    );
    final days = detail.minDays.clamp(1, 7);
    final quote = await discovery.quote(
      card.id,
      listing.BlockedRange(start, start.add(Duration(days: days - 1))),
    );
    expect(quote.days, days);
    expect(
      quote.totalPaise,
      quote.rentPaise + quote.feePaise + quote.depositPaise,
    );

    final cards = await discovery.cards([
      card.id,
      '00000000-0000-4000-8000-000000000000', // unknown: skipped
    ]);
    expect(cards.map((c) => c.id), [card.id]);
  }, skip: liveUrl.isEmpty ? 'Set --dart-define=LIVE_API_URL to run' : false);
}

/// Waits (up to 5 s) for [done].
Future<void> _until(FutureOr<bool> Function() done) async {
  for (var i = 0; i < 50 && !await done(); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  expect(await done(), isTrue);
}

String _randomPhone() {
  final random = Random();
  return '9${List.generate(9, (_) => random.nextInt(10)).join()}';
}

/// Signs [phone] in with the bypass code (a new user gets a name, and an
/// email when [verifyEmail]).
Future<({Dio api, AuthRepository repo})> _signIn(
  String phone, {
  bool verifyEmail = false,
}) async {
  Dio dio() => Dio(BaseOptions(baseUrl: '$liveUrl/v1'));
  final storage = InMemorySessionStorage();
  final tokens = TokenManager(dio: dio(), store: storage);
  final api = dio();
  api.interceptors.add(AuthInterceptor(tokens, api));
  final repo = AuthRepository(
    dio: api,
    tokens: tokens,
    store: storage,
    device: FakeDeviceInfo(),
  );
  final challenge = await repo.requestPhoneOtp(phone);
  final login = await repo.verifyPhoneOtp(challenge.challengeId, bypassCode);
  if (login.isNewUser) await repo.updateName('Live Borrower');
  if (verifyEmail) {
    final c = await repo.requestEmailOtp('live.$phone@example.com');
    await repo.verifyEmailOtp(c.challengeId, bypassCode);
  }
  return (api: api, repo: repo);
}
