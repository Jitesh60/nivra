// Contract test against a running Sajha API (skipped by default).
//
//   # API started with OTP_DEV_BYPASS_CODE=000000
//   flutter test test/live_api_test.dart --dart-define=LIVE_API_URL=http://localhost:3000
//
// Uses the real AuthRepository, TokenManager and interceptor over real HTTP,
// so it catches any drift between the app's models and the API.
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/network/api_exception.dart';
import 'package:sajha/core/network/auth_interceptor.dart';
import 'package:sajha/core/network/token_manager.dart';
import 'package:sajha/core/network/upload_client.dart';
import 'package:sajha/features/auth/data/auth_repository.dart';
import 'package:sajha/features/documents/data/documents_repository.dart';
import 'package:sajha/features/documents/data/models.dart';
import 'package:sajha/features/listings/data/listings_repository.dart';
import 'package:sajha/features/listings/data/models.dart' as listing;
import 'package:sajha/features/profile/data/profile_repository.dart';

import 'helpers/fakes.dart';

const liveUrl = String.fromEnvironment('LIVE_API_URL');
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

    // Delete the account so the test leaves nothing behind.
    await repo.deleteAccount();
    expect(storage.refreshToken, isNull);
    await expectLater(tokens.refresh(), completion(isNull));
  }, skip: liveUrl.isEmpty ? 'Set --dart-define=LIVE_API_URL to run' : false);
}
