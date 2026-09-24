import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Asks for a rental's pickup and return days. A seam so tests can answer
/// without driving the calendar.
typedef DateRangeChooser = Future<DateTimeRange?> Function(
  BuildContext context, {
  required DateTime first,
  required DateTime last,
  DateTimeRange? initial,
  bool Function(DateTime day)? selectable,
});

Future<DateTimeRange?> _material(
  BuildContext context, {
  required DateTime first,
  required DateTime last,
  DateTimeRange? initial,
  bool Function(DateTime day)? selectable,
}) => showDateRangePicker(
  context: context,
  firstDate: first,
  lastDate: last,
  initialDateRange: initial,
  helpText: 'Pickup and return days',
  saveText: 'Done',
  selectableDayPredicate: selectable == null
      ? null
      : (day, _, _) => selectable(day),
);

final dateRangeChooserProvider = Provider<DateRangeChooser>((ref) => _material);

/// Today in the device's calendar, at midnight.
DateTime today() {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day);
}
