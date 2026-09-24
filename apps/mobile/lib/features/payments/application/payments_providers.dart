import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/realtime/realtime_client.dart';
import '../../discovery/application/discovery_providers.dart' show noRetry;
import '../data/models.dart';
import '../data/payments_repository.dart';

/// The lender's earnings and payout account. Reloads when a booking changes
/// (a new payment, a cancellation).
final earningsProvider = FutureProvider.autoDispose<Earnings>((ref) {
  final sub = ref
      .watch(realtimeClientProvider)
      .events
      .where((e) => e.name == RealtimeEvents.bookingUpdated)
      .listen((_) => ref.invalidateSelf());
  ref.onDispose(sub.cancel);
  return ref.read(paymentsRepositoryProvider).earnings();
}, retry: noRetry);
