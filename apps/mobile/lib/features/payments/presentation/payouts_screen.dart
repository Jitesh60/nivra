import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../../auth/application/auth_controller.dart';
import '../application/payments_providers.dart';
import '../data/models.dart';
import '../data/payments_repository.dart';

/// Lender: the bank account Nivra pays out to (a Razorpay Route linked
/// account). Set up once; Razorpay verifies it.
class PayoutsScreen extends ConsumerWidget {
  const PayoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final earnings = ref.watch(earningsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Payouts')),
      body: switch (earnings) {
        AsyncData(:final value) when value.account != null => _AccountView(
          value.account!,
        ),
        AsyncData() => const _PayoutForm(),
        AsyncError(:final error) => Center(
          child: Text(
            error is ApiException
                ? error.friendlyMessage
                : 'Couldn’t load your payout account.',
          ),
        ),
        _ => const Center(child: CircularProgressIndicator()),
      },
    );
  }
}

class _AccountView extends StatelessWidget {
  const _AccountView(this.a);

  final PayoutAccount a;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final (color, note) = switch (a.status) {
      PayoutAccountStatus.activated => (
        SajhaColors.success,
        'Payouts are on. Money for each booking is sent here once the item '
            'is back.',
      ),
      PayoutAccountStatus.pending => (
        SajhaColors.warning,
        'Razorpay is checking your details. This usually takes a few '
            'minutes, sometimes a day. Your earnings are kept until then.',
      ),
      PayoutAccountStatus.needsClarification => (
        SajhaColors.warning,
        a.statusReason ??
            'Razorpay needs more details. Contact Nivra support to finish.',
      ),
      PayoutAccountStatus.rejected => (
        SajhaColors.danger,
        a.statusReason ??
            'Razorpay couldn’t verify these details. Contact Nivra support.',
      ),
    };
    return ListView(
      padding: const EdgeInsets.all(SajhaSpacing.lg),
      children: [
        Row(
          children: [
            Icon(LucideIcons.landmark, color: color),
            const SizedBox(width: SajhaSpacing.sm),
            Text(
              a.status.label,
              key: const ValueKey('payout-account-status'),
              style: text.titleMedium?.copyWith(color: color),
            ),
          ],
        ),
        const SizedBox(height: SajhaSpacing.sm),
        Text(note),
        const Divider(height: SajhaSpacing.xl),
        _row('Account holder', a.beneficiaryName),
        _row('Account', '•••• ${a.bankLast4}'),
        _row('IFSC', a.ifsc),
        _row('PAN', '•••••${a.panLast4}'),
        const SizedBox(height: SajhaSpacing.md),
        Text(
          'Nivra keeps only the last 4 digits. To change the account, '
          'contact support.',
          style: text.bodySmall?.copyWith(color: muted),
        ),
      ],
    );
  }

  Widget _row(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        Expanded(child: Text(label)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
      ],
    ),
  );
}

class _PayoutForm extends ConsumerStatefulWidget {
  const _PayoutForm();

  @override
  ConsumerState<_PayoutForm> createState() => _PayoutFormState();
}

class _PayoutFormState extends ConsumerState<_PayoutForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _account = TextEditingController();
  final _account2 = TextEditingController();
  final _ifsc = TextEditingController();
  final _pan = TextEditingController();
  final _email = TextEditingController();
  final _street = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _pin = TextEditingController();
  bool _saving = false;

  static final _ifscPattern = RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$');
  static final _panPattern = RegExp(r'^[A-Z]{5}\d{4}[A-Z]$');

  @override
  void initState() {
    super.initState();
    final auth = ref.read(authControllerProvider);
    final user = auth is Authenticated ? auth.user : null;
    _name.text = user?.name ?? '';
    _email.text = user?.email ?? '';
  }

  @override
  void dispose() {
    for (final c in [
      _name,
      _account,
      _account2,
      _ifsc,
      _pan,
      _email,
      _street,
      _city,
      _state,
      _pin,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _saving = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref
          .read(paymentsRepositoryProvider)
          .setUpPayouts(
            PayoutAccountInput(
              beneficiaryName: _name.text,
              accountNumber: _account.text,
              ifsc: _ifsc.text,
              pan: _pan.text,
              email: _email.text,
              street: _street.text,
              city: _city.text,
              state: _state.text,
              postalCode: _pin.text,
            ),
          );
      ref.invalidate(earningsProvider);
      messenger.showSnackBar(
        const SnackBar(content: Text('Bank account added')),
      );
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _field(
    String key,
    TextEditingController c,
    String label, {
    String? Function(String v)? check,
    TextInputType? keyboard,
    bool caps = false,
    bool obscure = false,
    int? maxLength,
    List<TextInputFormatter>? formatters,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: SajhaSpacing.sm),
    child: TextFormField(
      key: ValueKey(key),
      controller: c,
      obscureText: obscure,
      keyboardType: keyboard,
      maxLength: maxLength,
      textCapitalization: caps
          ? TextCapitalization.characters
          : TextCapitalization.none,
      inputFormatters: formatters,
      decoration: InputDecoration(labelText: label, counterText: ''),
      validator: (v) {
        final value = (v ?? '').trim();
        if (value.isEmpty) return 'Required';
        return check?.call(caps ? value.toUpperCase() : value);
      },
    ),
  );

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final digits = [FilteringTextInputFormatter.digitsOnly];
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        children: [
          Text('Where should we send your earnings?', style: text.titleMedium),
          const SizedBox(height: SajhaSpacing.xs),
          Text(
            'Razorpay, our payment partner, verifies the account in your '
            'name. Nivra keeps only the last 4 digits.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: SajhaSpacing.md),
          _field(
            'payout-name',
            _name,
            'Name on the bank account',
            check: (v) => v.length < 3 ? 'Enter the full name' : null,
          ),
          _field(
            'payout-account',
            _account,
            'Account number',
            keyboard: TextInputType.number,
            obscure: true,
            maxLength: 18,
            formatters: digits,
            check: (v) => RegExp(r'^\d{9,18}$').hasMatch(v)
                ? null
                : 'Account numbers are 9–18 digits',
          ),
          _field(
            'payout-account-again',
            _account2,
            'Account number again',
            keyboard: TextInputType.number,
            maxLength: 18,
            formatters: digits,
            check: (v) => v == _account.text.trim()
                ? null
                : 'The account numbers don’t match',
          ),
          _field(
            'payout-ifsc',
            _ifsc,
            'IFSC',
            caps: true,
            maxLength: 11,
            check: (v) =>
                _ifscPattern.hasMatch(v) ? null : 'Looks like HDFC0001234',
          ),
          _field(
            'payout-pan',
            _pan,
            'PAN',
            caps: true,
            maxLength: 10,
            check: (v) =>
                _panPattern.hasMatch(v) ? null : 'Looks like ABCDE1234F',
          ),
          _field(
            'payout-email',
            _email,
            'Email',
            keyboard: TextInputType.emailAddress,
            check: (v) => v.contains('@') ? null : 'Enter a valid email',
          ),
          _field(
            'payout-street',
            _street,
            'Address',
            check: (v) => v.length < 3 ? 'Enter your address' : null,
          ),
          Row(
            children: [
              Expanded(child: _field('payout-city', _city, 'City')),
              const SizedBox(width: SajhaSpacing.sm),
              Expanded(child: _field('payout-state', _state, 'State')),
            ],
          ),
          _field(
            'payout-pin',
            _pin,
            'PIN code',
            keyboard: TextInputType.number,
            maxLength: 6,
            formatters: digits,
            check: (v) => v.length == 6 ? null : 'PIN codes are 6 digits',
          ),
          const SizedBox(height: SajhaSpacing.md),
          FilledButton(
            key: const ValueKey('payout-save'),
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'Saving…' : 'Add bank account'),
          ),
        ],
      ),
    );
  }
}
