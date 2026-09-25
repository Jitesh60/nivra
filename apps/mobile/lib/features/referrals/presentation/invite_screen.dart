import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/share/share.dart';
import '../../../core/theme/tokens.g.dart';
import '../../bookings/presentation/booking_format.dart' show whenText;
import '../../listings/data/models.dart' show formatRupees;
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../../listings/data/models.dart' show BlockedRange;
import '../application/referral_controller.dart';
import '../data/referrals.dart';
import 'invite_code_card.dart';

/// What the share sheet sends: the code and the link.
String inviteText(Referral r) =>
    'Borrow what you need from people nearby on Sajha. Use my code ${r.code} '
    'for ${formatRupees(r.rules.refereeCreditPaise)} off your first rental: '
    '${r.link}';

/// "Credit covers up to 50% of the rent, lasts 30 days…", in one line.
String rulesLine(ReferralRules rules) =>
    'Credit covers up to ${rules.maxShareOfRentPct}% of the rent on a '
    'booking and lasts ${rules.redeemWithinDays} days. You can earn it for '
    'up to ${rules.maxReferrerRewards} friends.';

/// Your invite code and link, who joined, and your credit.
class InviteScreen extends ConsumerWidget {
  const InviteScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final referral = ref.watch(referralProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Invite friends')),
      body: switch (referral) {
        AsyncData(:final value?) => RefreshIndicator(
          onRefresh: () => ref.refresh(referralProvider.future),
          child: _Body(value),
        ),
        AsyncError(:final error) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Couldn’t load your invites.',
              ),
              TextButton(
                onPressed: () => ref.invalidate(referralProvider),
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

class _Body extends ConsumerWidget {
  const _Body(this.r);

  final Referral r;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final scheme = Theme.of(context).colorScheme;
    final give = formatRupees(r.rules.refereeCreditPaise);
    final get = formatRupees(r.rules.referrerCreditPaise);

    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        Text('Give $give, get $get', style: text.headlineSmall),
        const SizedBox(height: SajhaSpacing.xs),
        Text(
          'Friends get $give off their first rental. You get $get when '
          'they finish it.',
          style: text.bodyMedium,
        ),
        const SizedBox(height: SajhaSpacing.lg),
        Material(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(SajhaRadius.lg),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              SajhaSpacing.md,
              SajhaSpacing.sm,
              SajhaSpacing.xs,
              SajhaSpacing.sm,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Your code',
                        style: text.labelMedium?.copyWith(color: muted),
                      ),
                      Text(
                        r.code,
                        key: const ValueKey('invite-code'),
                        style: text.headlineSmall?.copyWith(
                          fontFamily: SajhaFonts.mono,
                          letterSpacing: 2,
                        ),
                      ),
                      SelectableText(
                        r.link,
                        key: const ValueKey('invite-link'),
                        style: text.bodySmall?.copyWith(color: muted),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  key: const ValueKey('copy-code'),
                  tooltip: 'Copy code',
                  icon: const Icon(Icons.copy),
                  onPressed: () async {
                    final messenger = ScaffoldMessenger.of(context);
                    await Clipboard.setData(ClipboardData(text: r.code));
                    messenger
                      ..hideCurrentSnackBar()
                      ..showSnackBar(
                        const SnackBar(content: Text('Code copied')),
                      );
                  },
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: SajhaSpacing.md),
        FilledButton.icon(
          key: const ValueKey('share-invite'),
          onPressed: () => ref.read(textSharerProvider)(
            inviteText(r),
            subject: 'Join me on Sajha',
          ),
          icon: const Icon(Icons.share_outlined),
          label: const Text('Share your invite'),
        ),
        const SizedBox(height: SajhaSpacing.lg),
        Row(
          children: [
            _Stat(label: 'Invited', value: '${r.invited}', id: 'invited'),
            _Stat(label: 'Rewarded', value: '${r.rewarded}', id: 'rewarded'),
            _Stat(
              label: 'Your credit',
              value: formatRupees(r.creditBalancePaise),
              id: 'credit',
            ),
          ],
        ),
        if (r.redeemBefore != null && r.creditBalancePaise > 0) ...[
          const SizedBox(height: SajhaSpacing.xs),
          Text(
            'Use it by ${formatRange(BlockedRange(r.redeemBefore!.toLocal(), r.redeemBefore!.toLocal()))}.',
            textAlign: TextAlign.center,
            style: text.bodySmall?.copyWith(color: muted),
          ),
        ],
        if (r.referredBy case final by?) ...[
          const SizedBox(height: SajhaSpacing.sm),
          Text(
            'You joined with ${by.firstName}’s invite.',
            textAlign: TextAlign.center,
            style: text.bodySmall?.copyWith(color: muted),
          ),
        ],
        if (r.canRedeem) ...[
          const SizedBox(height: SajhaSpacing.lg),
          InviteCodeCard(referral: r),
        ],
        const SizedBox(height: SajhaSpacing.lg),
        Text('Credit history', style: text.titleSmall),
        if (r.entries.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: SajhaSpacing.sm),
            child: Text(
              'Nothing yet. Credit you get and use shows up here.',
              style: TextStyle(color: muted),
            ),
          ),
        for (final e in r.entries)
          ListTile(
            key: ValueKey('credit-entry-${e.id}'),
            contentPadding: EdgeInsets.zero,
            title: Text(e.kind.label),
            subtitle: Text([?e.reason, whenText(e.createdAt)].join(' · ')),
            trailing: Text(
              e.amountPaise < 0
                  ? '−${formatRupees(-e.amountPaise)}'
                  : '+${formatRupees(e.amountPaise)}',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: e.amountPaise < 0 ? null : SajhaColors.success,
              ),
            ),
          ),
        const SizedBox(height: SajhaSpacing.md),
        Text(
          rulesLine(r.rules),
          key: const ValueKey('invite-rules'),
          style: text.bodySmall?.copyWith(color: muted),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.id});

  final String label;
  final String value;
  final String id;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Expanded(
      child: Column(
        children: [
          Text(value, key: ValueKey('invite-$id'), style: text.titleLarge),
          Text(
            label,
            style: text.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
