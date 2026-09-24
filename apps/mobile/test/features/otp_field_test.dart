import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/shared/widgets/otp_field.dart';

void main() {
  Future<List<String>> pumpField(WidgetTester tester) async {
    final completed = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(body: OtpField(onCompleted: completed.add)),
      ),
    );
    return completed;
  }

  testWidgets('fills six boxes and completes once', (tester) async {
    final completed = await pumpField(tester);
    await tester.enterText(find.byKey(const ValueKey('otp-input')), '482913');
    await tester.pump();
    expect(completed, ['482913']);
    for (final digit in '482913'.split('')) {
      expect(find.text(digit), findsOneWidget);
    }
  });

  testWidgets('ignores non-digits and extra characters (paste)', (
    tester,
  ) async {
    final completed = await pumpField(tester);
    await tester.enterText(
      find.byKey(const ValueKey('otp-input')),
      '12a34-5678',
    );
    await tester.pump();
    expect(completed, ['123456']);
  });

  testWidgets('offers one-time-code autofill', (tester) async {
    await pumpField(tester);
    final field = tester.widget<TextField>(
      find.byKey(const ValueKey('otp-input')),
    );
    expect(field.autofillHints, contains(AutofillHints.oneTimeCode));
    expect(field.keyboardType, TextInputType.number);
  });
}
