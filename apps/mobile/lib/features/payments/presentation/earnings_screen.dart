import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show BlockedRange, formatRupees;
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../application/payments_providers.dart';
import '../data/models.dart';

/// Lender: money from bookings (held, paid out, waiting for a bank account)
/// and the payout account.
class EarningsScreen extends ConsumerWidget {
  const EarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final earnings = ref.watch(earningsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: switch (earnings) {
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(earningsProvider.future),
          child: _EarningsList(value),
        ),
        AsyncError(:final error) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Couldn’t load your earnings.',
              ),
              TextButton(
                onPressed: () => ref.invalidate(earningsProvider),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _EarningsList extends StatelessWidget {
  const _EarningsList(this.e);

  final Earnings e;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final account = e.account;
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        Row(
          children: [
            _Total('Held', e.onHoldPaise, key: const ValueKey('earn-held')),
            _Total('Paid out', e.paidPaise, key: const ValueKey('earn-paid')),
          ],
        ),
        if (e.awaitingAccountPaise > 0)
          Padding(
            padding: const EdgeInsets.only(top: SajhaSpacing.sm),
            child: Text(
              '${formatRupees(e.awaitingAccountPaise)} is waiting for your '
              'bank account.',
              key: const ValueKey('earn-awaiting'),
              style: const TextStyle(color: SajhaColors.warning),
            ),
          ),
        const SizedBox(height: SajhaSpacing.sm),
        Text(
          'Rent less Nivra’s 10% commission. It’s held from the moment a '
          'booking is paid and sent to your bank once the item is back.',
          style: text.bodySmall?.copyWith(color: muted),
        ),

        const Divider(height: SajhaSpacing.xl),
        Text('Payout account', style: text.titleSmall),
        ListTile(
          key: const ValueKey('open-payouts'),
          contentPadding: EdgeInsets.zero,
          leading: Icon(
            account == null
                ? Icons.account_balance_outlined
                : account.status == PayoutAccountStatus.activated
                ? Icons.verified_outlined
                : Icons.hourglass_top,
          ),
          title: Text(
            account == null
                ? 'Set up payouts'
                : '${account.beneficiaryName} · ••${account.bankLast4}',
          ),
          subtitle: Text(
            account == null
                ? 'Add a bank account to get paid'
                : account.status.label,
            key: const ValueKey('payout-status'),
          ),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(Routes.payouts),
        ),

        const Divider(height: SajhaSpacing.xl),
        Text('Bookings', style: text.titleSmall),
        if (e.items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: SajhaSpacing.md),
            child: Text(
              'Nothing yet. When someone pays for one of your listings, '
              'it shows up here.',
              key: const ValueKey('earnings-empty'),
              style: TextStyle(color: muted),
            ),
          ),
        for (final (i, item) in e.items.indexed)
          ListTile(
            key: ValueKey('earning-$i'),
            contentPadding: EdgeInsets.zero,
            title: Text(item.listingTitle),
            subtitle: Text(
              '${formatRange(BlockedRange(item.startDate, item.endDate))} · '
              '${item.status.label}',
            ),
            trailing: Text(
              formatRupees(item.amountPaise),
              style: TextStyle(
                fontWeight: FontWeight.w600,
                decoration: item.status == TransferStatus.reversed
                    ? TextDecoration.lineThrough
                    : null,
              ),
            ),
            onTap: () => context.push(Routes.booking(item.bookingId)),
          ),
      ],
    );
  }
}

class _Total extends StatelessWidget {
  const _Total(this.label, this.paise, {super.key});

  final String label;
  final int paise;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(SajhaSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: text.labelMedium),
              Text(formatRupees(paise), style: text.titleLarge),
            ],
          ),
        ),
      ),
    );
  }
}
