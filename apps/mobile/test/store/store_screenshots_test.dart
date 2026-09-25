// Store screenshots: renders key screens against the fake API at a phone's
// size (1080×2400) and writes PNGs to store/screenshots/.
//
//   flutter test test/store --update-goldens --dart-define=STORE_SCREENSHOTS=true
//
// Skipped otherwise, so the normal test run doesn't depend on fonts or pixels.
import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/config/app_config.dart';
import 'package:sajha/core/router/app_router.dart';
import 'package:sajha/core/router/routes.dart';

import '../helpers/fake_api.dart';
import '../helpers/fakes.dart';
import '../helpers/pump_app.dart';

const _enabled = bool.fromEnvironment('STORE_SCREENSHOTS');

void main() {
  /// Listing photo id → placeholder image (store/photos).
  final photoFor = <String, String>{};

  setUpAll(() async {
    if (!_enabled) return;
    await _loadFonts();
    HttpOverrides.global = _PhotoServer(photoFor);
  });

  Future<(TestHarness, Map<String, String>)> market(WidgetTester tester) async {
    tester.view
      ..physicalSize = const Size(1080, 2400)
      ..devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final api = FakeSajhaApi();
    final asha = api.seedLender(name: 'Asha Patil', idVerified: true);
    final vikram = api.seedLender(name: 'Vikram Rao', phone: '+919811111111');
    final ids = <String, String>{};
    for (final (key, lender, title, category, price, lat, lng, area, about) in [
      (
        'tent',
        asha,
        'Quechua 2-person trekking tent',
        'cat-trek',
        15000,
        18.5080,
        73.8080,
        'Kothrud, Pune',
        'Waterproof two-person tent with the rain fly, pegs and bag. Used on three monsoon treks.',
      ),
      (
        'camera',
        vikram,
        'Canon EOS 200D with 18–55 mm',
        'cat-camera',
        50000,
        18.5300,
        73.8300,
        'Shivajinagar, Pune',
        'Easy DSLR for trips and weddings: kit lens, two batteries, charger and a 64 GB card.',
      ),
      (
        'drill',
        asha,
        'Bosch hammer drill with bits',
        'cat-trek',
        12000,
        18.5150,
        73.8000,
        'Karve Nagar, Pune',
        'Hammer drill with wall, wood and metal bits. Perfect for putting up shelves.',
      ),
      (
        'speaker',
        vikram,
        'JBL party speaker',
        'cat-camera',
        30000,
        18.5200,
        73.8400,
        'Deccan, Pune',
        'Loud, with 8 hours of battery and Bluetooth. Great for house parties.',
      ),
    ]) {
      final l = api.seedListing(
        lenderId: lender,
        title: title,
        categoryId: category,
        pricePerDayPaise: price,
        lat: lat,
        lng: lng,
        areaLabel: area,
        description: about,
      );
      photoFor[l.photos.first['id'] as String] = key;
      ids[key] = l.id;
    }
    final h = TestHarness(
      api: api,
      prefs: FakeAppPrefs(seen: true),
      env: AppEnv.prod,
    );
    h.storage.refreshToken = api.seedSession();
    await h.start(tester);
    return (h, ids);
  }

  Future<void> shoot(WidgetTester tester, String name) async {
    await settle(tester);
    await tester.runAsync(() async {
      for (final e in find.byType(Image).evaluate()) {
        await precacheImage((e.widget as Image).image, e);
      }
    });
    await settle(tester);
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('../../store/screenshots/$name.png'),
    );
  }

  Future<void> go(TestHarness h, WidgetTester tester, String route) async {
    h.container.read(routerProvider).push(route);
    await settle(tester);
  }

  testWidgets('01 home', (tester) async {
    await market(tester);
    await tapKey(tester, 'area-chip');
    await tapKey(tester, 'area-gps');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('section-near')),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await shoot(tester, '01-home');
  }, skip: !_enabled);

  testWidgets('02 item', (tester) async {
    final (h, ids) = await market(tester);
    await go(h, tester, Routes.item(ids['camera']!));
    await shoot(tester, '02-item');
  }, skip: !_enabled);

  testWidgets('03 chat', (tester) async {
    final (h, ids) = await market(tester);
    final api = h.api;
    final c = api.seedConversation(api.appUserId!, ids['tent']!);
    api
      ..sendAs(
        api.appUserId!,
        c.id,
        'Hi! Is the tent free this weekend for a trek to Rajmachi?',
      )
      ..sendAs(
        c.lenderId,
        c.id,
        'Yes, Saturday and Sunday are free. It has the rain fly and pegs.',
      )
      ..sendAs(api.appUserId!, c.id, 'Perfect, I’ll send a request now.');
    await go(h, tester, Routes.chat(c.id));
    await shoot(tester, '03-chat');
  }, skip: !_enabled);

  testWidgets('04 booking', (tester) async {
    final (h, ids) = await market(tester);
    final api = h.api;
    final b = api.seedBooking(
      api.appUserId!,
      ids['tent']!,
      start: _day(3),
      end: _day(4),
      status: 'AWAITING_PAYMENT',
    );
    api.payAs(b.id);
    await go(h, tester, Routes.booking(b.id));
    await shoot(tester, '04-booking');
  }, skip: !_enabled);

  testWidgets('05 handover code', (tester) async {
    final (h, ids) = await market(tester);
    final api = h.api;
    final b = api.seedBooking(
      api.appUserId!,
      ids['camera']!,
      start: _day(0),
      end: _day(1),
      status: 'AWAITING_PAYMENT',
    );
    api.payAs(b.id);
    await go(h, tester, Routes.bookingCode(b.id));
    await shoot(tester, '05-handover-code');
  }, skip: !_enabled);
}

String _day(int offset) {
  final ist = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
  final d = DateTime(ist.year, ist.month, ist.day + offset);
  return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

/// Real fonts, so text and icons aren't boxes: Roboto and Material icons
/// from the Flutter SDK, plus the app's bundled fonts and Lucide.
Future<void> _loadFonts() async {
  var dir = File(Platform.resolvedExecutable).parent;
  while (!Directory('${dir.path}/material_fonts').existsSync()) {
    dir = dir.parent;
  }
  final fonts = '${dir.path}/material_fonts';
  Future<ByteData> bytes(String file) async =>
      ByteData.sublistView(await File('$fonts/$file').readAsBytes());
  final roboto = FontLoader('Roboto');
  for (final f in ['Regular', 'Medium', 'Bold', 'Light']) {
    roboto.addFont(bytes('Roboto-$f.ttf'));
  }
  await roboto.load();
  await (FontLoader(
    'MaterialIcons',
  )..addFont(bytes('MaterialIcons-Regular.otf'))).load();

  // The bundled DESIGN.md fonts and the Lucide icons (from the asset bundle).
  Future<void> family(String name, List<String> assets) async {
    final loader = FontLoader(name);
    for (final a in assets) {
      loader.addFont(rootBundle.load(a));
    }
    await loader.load();
  }

  await family('Plus Jakarta Sans', [
    for (final w in ['400Regular', '500Medium', '600SemiBold', '700Bold'])
      'assets/fonts/PlusJakartaSans_$w.ttf',
  ]);
  await family('Bricolage Grotesque', [
    'assets/fonts/BricolageGrotesque_600SemiBold.ttf',
    'assets/fonts/BricolageGrotesque_700Bold.ttf',
  ]);
  await family('JetBrains Mono', [
    'assets/fonts/JetBrainsMono_400Regular.ttf',
    'assets/fonts/JetBrainsMono_500Medium.ttf',
  ]);
  await family('packages/lucide_icons_flutter/Lucide', [
    'packages/lucide_icons_flutter/assets/lucide.ttf',
  ]);
}

/// Serves the placeholder photos for listing image URLs; 404 for anything else.
class _PhotoServer extends HttpOverrides {
  _PhotoServer(this.photoFor);

  final Map<String, String> photoFor;

  @override
  HttpClient createHttpClient(SecurityContext? context) => _Client(this);

  List<int>? bytesFor(Uri uri) {
    for (final MapEntry(key: id, value: name) in photoFor.entries) {
      if (uri.path.contains(id)) {
        return File('store/photos/$name.png').readAsBytesSync();
      }
    }
    return null;
  }
}

class _Client implements HttpClient {
  _Client(this.server);

  final _PhotoServer server;

  @override
  bool autoUncompress = true;

  @override
  Future<HttpClientRequest> getUrl(Uri url) async =>
      _Request(server.bytesFor(url));

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Request implements HttpClientRequest {
  _Request(this.bytes);

  final List<int>? bytes;

  @override
  final HttpHeaders headers = _Headers();

  @override
  Future<HttpClientResponse> close() async => _Response(bytes);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Response extends Stream<List<int>> implements HttpClientResponse {
  _Response(this.bytes);

  final List<int>? bytes;

  @override
  int get statusCode => bytes == null ? 404 : 200;

  @override
  int get contentLength => bytes?.length ?? 0;

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.fromIterable([?bytes]).listen(
    onData,
    onError: onError,
    onDone: onDone,
    cancelOnError: cancelOnError,
  );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Headers implements HttpHeaders {
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}

  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
