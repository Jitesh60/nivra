import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart' show formatRupees;
import '../application/referral_controller.dart';
import '../data/referrals.dart';

/// "Have an invite code?": a new member enters a friend's code for credit.
class InviteCodeCard extends ConsumerStatefulWidget {
  const InviteCodeCard({required this.referral, this.onDismiss, super.key});

  final Referral referral;

  /// Shows a close button (on Home).
  final VoidCallback? onDismiss;

  @override
  ConsumerState<InviteCodeCard> createState() => _InviteCodeCardState();
}

class _InviteCodeCardState extends ConsumerState<InviteCodeCard> {
  final _code = TextEditingController();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _code.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _redeem() async {
    final messenger = ScaffoldMessenger.of(context);
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    try {
      await ref.read(referralProvider.notifier).redeem(_code.text.trim());
      final balance = ref.read(referralProvider).value?.creditBalancePaise;
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              balance == null || balance == 0
                  ? 'Code applied.'
                  : 'Code applied. You have ${formatRupees(balance)} to use '
                        'on your first rental.',
            ),
          ),
        );
    } on ApiException catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final credit = formatRupees(widget.referral.rules.refereeCreditPaise);
    return Card(
      key: const ValueKey('invite-code-card'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(SajhaSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Have an invite code?', style: text.titleMedium),
                ),
                if (widget.onDismiss != null)
                  IconButton(
                    key: const ValueKey('dismiss-invite-card'),
                    tooltip: 'Not now',
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.close),
                    onPressed: widget.onDismiss,
                  ),
              ],
            ),
            Text(
              'Enter a friend’s code and get $credit off your first rental.',
              style: text.bodyMedium,
            ),
            const SizedBox(height: SajhaSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    key: const ValueKey('invite-code-input'),
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 20,
                    decoration: const InputDecoration(
                      hintText: 'e.g. RAHUL123',
                      counterText: '',
                      isDense: true,
                    ),
                    onSubmitted: (_) =>
                        _code.text.trim().isEmpty || _busy ? null : _redeem(),
                  ),
                ),
                const SizedBox(width: SajhaSpacing.sm),
                FilledButton(
                  key: const ValueKey('redeem-code'),
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 48)),
                  onPressed: _code.text.trim().isEmpty || _busy
                      ? null
                      : _redeem,
                  child: const Text('Apply'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
