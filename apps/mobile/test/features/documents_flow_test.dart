import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';
import 'package:sajha/features/documents/presentation/document_viewer_screen.dart';

import '../helpers/fake_api.dart';
import '../helpers/pump_app.dart';

void main() {
  Future<TestHarness> atDocuments(WidgetTester tester) async {
    final h = TestHarness();
    h.storage.refreshToken = h.api.seedSession();
    await h.start(tester);
    h.container.read(routerProvider).push(Routes.documents);
    await settle(tester);
    return h;
  }

  Future<void> chooseType(WidgetTester tester, String label) async {
    await tapKey(tester, 'doc-type');
    await tester.tap(find.text(label).last);
    await settle(tester);
  }

  Future<void> addPhoto(WidgetTester tester, String slot) async {
    await tapKey(tester, slot);
    await tapText(tester, 'Choose from gallery');
  }

  Future<bool> submitEnabled(WidgetTester tester) async {
    final button = find.byKey(const ValueKey('doc-submit'));
    await tester.scrollUntilVisible(
      button,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    return tester.widget<FilledButton>(button).enabled;
  }

  testWidgets('adds a masked Aadhaar (front + back); approval earns the ID '
      'badge', (tester) async {
    final h = await atDocuments(tester);
    expect(find.textContaining('No documents yet'), findsOneWidget);

    await tapKey(tester, 'add-document');
    await chooseType(tester, 'Masked Aadhaar');
    expect(find.textContaining('masked Aadhaar'), findsWidgets);
    expect(find.textContaining('Never upload a full Aadhaar'), findsOneWidget);

    await addPhoto(tester, 'photo-front');
    expect(
      await submitEnabled(tester),
      isFalse,
      reason: 'back photo still missing',
    );
    await addPhoto(tester, 'photo-back');
    expect(await submitEnabled(tester), isTrue);

    await tapKey(tester, 'doc-submit');
    expect(h.api.requests.where((r) => r == 'POST /uploads'), hasLength(2));
    expect(h.api.storagePuts, hasLength(2));
    final doc = h.api.documents.values.single;
    expect(doc.type, 'AADHAAR_MASKED');
    expect(doc.hasBack, isTrue);
    expect(find.text('Under review'), findsOneWidget);
    expect(
      find.text('Document added. We’ll review it shortly.'),
      findsOneWidget,
    );

    // An admin approves it; the next load refreshes the badge.
    h.api.review(doc.id);
    h.container.read(routerProvider).go(Routes.home);
    await settle(tester);
    h.container.read(routerProvider).push(Routes.documents);
    await settle(tester);
    expect(find.text('Approved'), findsOneWidget);
    h.container.read(routerProvider).pop();
    await settle(tester);
    // Fully verified: home drops the verification prompt; the profile shows it.
    expect(find.byKey(const ValueKey('add-id')), findsNothing);
    h.container.read(routerProvider).push(Routes.profile);
    await settle(tester);
    expect(find.text('ID verified'), findsOneWidget);
    h.container.read(routerProvider).pop();
    await settle(tester);

    // The same type can't be added twice while it's live.
    h.container.read(routerProvider).push(Routes.documents);
    await settle(tester);
    await tapKey(tester, 'add-document');
    await tapKey(tester, 'doc-type');
    expect(find.text('Masked Aadhaar (already added)'), findsWidgets);
  });

  testWidgets('OTHER needs a name; single-sided types need one photo', (
    tester,
  ) async {
    final h = await atDocuments(tester);
    await tapKey(tester, 'add-document');

    await chooseType(tester, 'Other document');
    await addPhoto(tester, 'photo-front');
    expect(find.byKey(const ValueKey('photo-back')), findsNothing);
    expect(await submitEnabled(tester), isFalse);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('doc-label')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    await enterText(tester, 'doc-label', 'Gym card');
    expect(await submitEnabled(tester), isTrue);

    await tapKey(tester, 'doc-submit');
    expect(h.api.documents.values.single.label, 'Gym card');
    expect(find.text('Gym card'), findsOneWidget);
  });

  testWidgets('shows the rejection reason; deleting asks first', (
    tester,
  ) async {
    final h = await atDocuments(tester);
    await tapKey(tester, 'add-document');
    await chooseType(tester, 'PAN card');
    await addPhoto(tester, 'photo-front');
    await tapKey(tester, 'doc-submit');

    final doc = h.api.documents.values.single;
    h.api.review(doc.id, approve: false, reason: 'The photo is blurry');
    await tester.fling(find.text('PAN card'), const Offset(0, 400), 1000);
    await settle(tester, 20);
    expect(find.text('Rejected'), findsOneWidget);
    expect(find.text('The photo is blurry'), findsOneWidget);

    await tapKey(tester, 'document-${doc.id}');
    await tapKey(tester, 'delete-document');
    await tapText(tester, 'Cancel');
    expect(h.api.documents, isNotEmpty);

    await tapKey(tester, 'document-${doc.id}');
    await tapKey(tester, 'delete-document');
    await tapText(tester, 'Delete');
    expect(h.api.documents, isEmpty);
    expect(find.textContaining('No documents yet'), findsOneWidget);
  });

  testWidgets('views a side through a short-lived link', (tester) async {
    final h = await atDocuments(tester);
    await tapKey(tester, 'add-document');
    await chooseType(tester, 'Driving licence');
    await addPhoto(tester, 'photo-front');
    await addPhoto(tester, 'photo-back');
    await tapKey(tester, 'doc-submit');

    final doc = h.api.documents.values.single;
    await tapKey(tester, 'document-${doc.id}');
    await tapText(tester, 'View back');
    expect(find.byType(DocumentViewerScreen), findsOneWidget);
    expect(find.text('Driving licence · back'), findsOneWidget);
    expect(h.api.requests, contains('GET /me/documents/${doc.id}/view'));
    final image = tester.widget<Image>(
      find.byKey(const ValueKey('document-image')),
    );
    expect(
      (image.image as NetworkImage).url,
      'http://${FakeSajhaApi.storageHost}/view/${doc.id}',
    );
  });
}
