import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/media/photo_picker.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';
import 'package:sajha/features/auth/application/auth_controller.dart';
import 'package:sajha/features/auth/data/models.dart';

import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

void main() {
  Future<TestHarness> signedIn(WidgetTester tester) async {
    final h = TestHarness();
    h.storage.refreshToken = h.api.seedSession();
    await h.start(tester);
    return h;
  }

  AppUser currentUser(TestHarness h) =>
      (h.container.read(authControllerProvider) as Authenticated).user;

  testWidgets('edits name, city and bio from Home → Profile', (tester) async {
    final h = await signedIn(tester);
    await tapKey(tester, 'open-profile');
    expect(find.text('Your profile'), findsOneWidget);
    expect(find.text('ID not verified'), findsOneWidget);

    await enterText(tester, 'profile-city', '  Pune ');
    await enterText(tester, 'profile-bio', 'Weekend trekker with spare tents.');
    await tapKey(tester, 'profile-save');

    expect(find.text('Profile saved'), findsOneWidget);
    expect(currentUser(h).city, 'Pune');
    expect(currentUser(h).bio, 'Weekend trekker with spare tents.');

    // Clearing a field sends an empty string, which clears it on the server.
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('profile-city')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await enterText(tester, 'profile-city', '');
    await tapKey(tester, 'profile-save');
    expect(currentUser(h).city, isNull);

    // A name is required.
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('profile-name')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await enterText(tester, 'profile-name', 'R');
    await tapKey(tester, 'profile-save');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('profile-name')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Enter your name as on your ID'), findsOneWidget);
    expect(currentUser(h).name, 'Rahul Sharma');
  });

  testWidgets('sets a cropped profile photo via presigned upload, then '
      'removes it', (tester) async {
    final h = await signedIn(tester);
    h.container.read(routerProvider).push(Routes.profile);
    await settle(tester);

    await tapKey(tester, 'change-photo');
    expect(find.text('Remove photo'), findsNothing);
    await tapText(tester, 'Choose from gallery');

    expect(h.picker.calls.single, (
      source: PhotoSource.gallery,
      squareCrop: true,
    ));
    expect(
      h.api.requests,
      containsAllInOrder(['POST /uploads', 'PUT /me/avatar']),
    );
    // The PUT to storage carries the signed headers and never the token.
    final put = h.api.storagePuts.single;
    expect(put['Content-Type'], 'image/jpeg');
    expect(
      put.keys.map((k) => k.toLowerCase()),
      isNot(contains('authorization')),
    );
    expect(currentUser(h).avatarUrl, startsWith('http://cdn.test/avatars/'));
    expect(find.text('Profile photo updated'), findsOneWidget);

    await tapKey(tester, 'change-photo');
    await tapText(tester, 'Remove photo');
    expect(currentUser(h).avatarUrl, isNull);
  });

  testWidgets('cancelling the picker uploads nothing; a non-image is refused '
      'before upload', (tester) async {
    final h = await signedIn(tester);
    h.container.read(routerProvider).push(Routes.profile);
    await settle(tester);

    h.picker.next = null;
    await tapKey(tester, 'change-photo');
    await tapText(tester, 'Take photo');
    expect(h.picker.calls.single.source, PhotoSource.camera);
    expect(h.api.requests, isNot(contains('POST /uploads')));

    h.picker.next = fakeJpeg()..setAll(0, [0x25, 0x50, 0x44, 0x46]); // %PDF
    await tapKey(tester, 'change-photo');
    await tapText(tester, 'Take photo');
    expect(h.api.requests, isNot(contains('POST /uploads')));
    expect(
      find.text('That photo couldn’t be used. Try a different one.'),
      findsOneWidget,
    );
  });

  testWidgets('Settings links to profile and documents', (tester) async {
    final h = await signedIn(tester);
    h.container.read(routerProvider).push(Routes.settings);
    await settle(tester);
    expect(find.text('No verified ID'), findsOneWidget);

    await tapKey(tester, 'settings-documents');
    expect(find.text('My documents'), findsWidgets);
    expect(h.api.requests, contains('GET /me/documents'));
  });
}
