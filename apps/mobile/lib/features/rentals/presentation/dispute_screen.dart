import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../../bookings/application/bookings_providers.dart';
import '../../bookings/data/models.dart';
import '../../listings/data/models.dart' show formatRupees;
import '../data/rentals_repository.dart';
import 'photo_grid.dart';

/// Lender: report a problem and claim part of the deposit. Borrower
/// ([respond]): give your side, once. Sajha decides.
class DisputeScreen extends ConsumerStatefulWidget {
  const DisputeScreen({
    required this.bookingId,
    this.respond = false,
    super.key,
  });

  final String bookingId;
  final bool respond;

  @override
  ConsumerState<DisputeScreen> createState() => _DisputeScreenState();
}

class _DisputeScreenState extends ConsumerState<DisputeScreen> {
  final _text = TextEditingController();
  final _amount = TextEditingController();
  DisputeReason? _reason;
  List<Uint8List> _photos = const [];
  bool _busy = false;
  double? _progress;

  @override
  void dispose() {
    _text.dispose();
    _amount.dispose();
    super.dispose();
  }

  /// Rupees typed → paise (null when not a number).
  int? get _claimPaise {
    final v = double.tryParse(_amount.text.trim().replaceAll(',', ''));
    return v == null ? null : (v * 100).round();
  }

  Future<void> _submit(BookingDetail d) async {
    setState(() {
      _busy = true;
      _progress = 0;
    });
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final repo = ref.read(rentalsRepositoryProvider);
    void progress(double p) {
      if (mounted) setState(() => _progress = p);
    }

    try {
      final updated = widget.respond
          ? await repo.respondToDispute(
              widget.bookingId,
              note: _text.text,
              photos: _photos,
              onProgress: progress,
            )
          : await repo.openDispute(
              widget.bookingId,
              reason: _reason!,
              description: _text.text,
              claimPaise: _claimPaise!,
              photos: _photos,
              onProgress: progress,
            );
      ref.read(bookingProvider(widget.bookingId).notifier).replace(updated);
      navigator.pop();
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              widget.respond
                  ? 'Your side was sent'
                  : 'Problem reported to Sajha',
            ),
          ),
        );
    } on ApiException catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _progress = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final detail = ref.watch(bookingProvider(widget.bookingId)).value;
    if (detail == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final b = detail.booking;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final lateFee = detail.rental?.returnedAt == null
        ? 0
        : detail.rental!.lateFeePaise;
    final max = b.depositPaise - lateFee;
    // Before the return, the only claim is that it hasn't come back.
    final reasons = b.status == BookingStatus.active
        ? const [DisputeReason.notReturned]
        : DisputeReason.values
              .where((r) => r != DisputeReason.notReturned)
              .toList();
    final claim = _claimPaise;
    final ready = widget.respond
        ? _text.text.trim().length >= 3
        : _reason != null &&
              claim != null &&
              claim >= 0 &&
              claim <= max &&
              _text.text.trim().length >= 10;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.respond ? 'Your side' : 'Report a problem'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        children: [
          if (widget.respond && detail.dispute != null) ...[
            Text(
              '${b.other.firstName} says: ${detail.dispute!.reason.label}',
              style: text.titleSmall,
            ),
            const SizedBox(height: SajhaSpacing.xs),
            Text('“${detail.dispute!.description}”'),
            const SizedBox(height: SajhaSpacing.xs),
            Text(
              'They ask to keep ${formatRupees(detail.dispute!.claimPaise)} '
              'of your deposit.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
            const Divider(height: SajhaSpacing.xl),
          ] else ...[
            Text(
              'Sajha looks at both sides, the photos from the handover and '
              'the return, and the chat, then decides what happens to the '
              '${formatRupees(b.depositPaise)} deposit.',
              style: text.bodySmall?.copyWith(color: muted),
            ),
            const SizedBox(height: SajhaSpacing.md),
            Text('What happened?', style: text.titleSmall),
            RadioGroup<DisputeReason>(
              groupValue: _reason,
              onChanged: (r) => setState(() => _reason = r),
              child: Column(
                children: [
                  for (final r in reasons)
                    RadioListTile<DisputeReason>(
                      key: ValueKey('dispute-reason-${r.apiValue}'),
                      contentPadding: EdgeInsets.zero,
                      value: r,
                      title: Text(r.label),
                    ),
                ],
              ),
            ),
            TextField(
              key: const ValueKey('dispute-amount'),
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[\d.]')),
              ],
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: 'Amount to keep from the deposit (₹)',
                helperText: 'Up to ${formatRupees(max)}',
                errorText: claim != null && claim > max
                    ? 'At most ${formatRupees(max)}'
                    : null,
              ),
            ),
            const SizedBox(height: SajhaSpacing.md),
          ],
          TextField(
            key: const ValueKey('dispute-text'),
            controller: _text,
            maxLength: 1000,
            maxLines: 5,
            minLines: 3,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: widget.respond
                  ? 'What happened, from your side'
                  : 'Describe the problem',
            ),
          ),
          const SizedBox(height: SajhaSpacing.sm),
          Text('Photos (optional, up to 6)', style: text.titleSmall),
          const SizedBox(height: SajhaSpacing.sm),
          PhotoGrid(
            photos: _photos,
            onChanged: (p) => setState(() => _photos = p),
          ),
          const SizedBox(height: SajhaSpacing.lg),
          if (_progress != null) ...[
            LinearProgressIndicator(value: _progress),
            const SizedBox(height: SajhaSpacing.sm),
          ],
          FilledButton(
            key: const ValueKey('dispute-submit'),
            onPressed: !ready || _busy ? null : () => _submit(detail),
            child: Text(widget.respond ? 'Send' : 'Report to Sajha'),
          ),
        ],
      ),
    );
  }
}
