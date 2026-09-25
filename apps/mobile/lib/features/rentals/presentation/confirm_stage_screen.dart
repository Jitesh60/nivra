import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/scanner/code_scanner.dart';
import '../../../core/theme/tokens.g.dart';
import '../../bookings/application/bookings_providers.dart';
import '../../bookings/data/models.dart';
import '../data/rentals_repository.dart';
import 'photo_grid.dart';

/// Photos needed to confirm a handover or a return.
const minConfirmPhotos = 2;

/// Confirms the handover (lender) or the return (borrower): the other
/// person's code, scanned or typed, and photos of the item's condition.
class ConfirmStageScreen extends ConsumerStatefulWidget {
  const ConfirmStageScreen({
    required this.bookingId,
    required this.stage,
    super.key,
  });

  final String bookingId;
  final RentalStage stage;

  @override
  ConsumerState<ConfirmStageScreen> createState() => _ConfirmStageScreenState();
}

class _ConfirmStageScreenState extends ConsumerState<ConfirmStageScreen> {
  final _code = TextEditingController();
  final _note = TextEditingController();
  List<Uint8List> _photos = const [];
  bool _busy = false;
  double? _progress;

  bool get _handover => widget.stage == RentalStage.handover;

  @override
  void dispose() {
    _code.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _scan() async {
    final raw = await ref.read(codeScannerProvider)(context);
    if (raw == null || !mounted) return;
    final code = codeFromQr(raw, bookingId: widget.bookingId);
    if (code == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('That isn’t the code for this booking.')),
      );
      return;
    }
    setState(() => _code.text = code);
  }

  Future<void> _confirm() async {
    setState(() {
      _busy = true;
      _progress = 0;
    });
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final repo = ref.read(rentalsRepositoryProvider);
    try {
      void progress(double p) {
        if (mounted) setState(() => _progress = p);
      }

      final code = _code.text.trim();
      final updated = _handover
          ? await repo.handOver(
              widget.bookingId,
              code: code,
              photos: _photos,
              note: _note.text,
              onProgress: progress,
            )
          : await repo.returnItem(
              widget.bookingId,
              code: code,
              photos: _photos,
              note: _note.text,
              onProgress: progress,
            );
      ref.read(bookingProvider(widget.bookingId).notifier).replace(updated);
      navigator.pop();
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(_handover ? 'Handed over' : 'Return confirmed'),
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
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final ready =
        _code.text.trim().length == 6 && _photos.length >= minConfirmPhotos;
    return Scaffold(
      appBar: AppBar(title: Text(_handover ? 'Hand over' : 'Return')),
      body: ListView(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        children: [
          Text('1. Their code', style: text.titleSmall),
          const SizedBox(height: SajhaSpacing.xs),
          Text(
            _handover
                ? 'Ask the borrower to open their handover code, then scan it.'
                : 'Ask the lender to open their return code, then scan it.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: SajhaSpacing.sm),
          Row(
            children: [
              Expanded(
                child: TextField(
                  key: const ValueKey('stage-code'),
                  controller: _code,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  onChanged: (_) => setState(() {}),
                  decoration: const InputDecoration(
                    labelText: '6-digit code',
                    counterText: '',
                  ),
                ),
              ),
              const SizedBox(width: SajhaSpacing.sm),
              FilledButton.tonalIcon(
                key: const ValueKey('stage-scan'),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
                onPressed: _busy ? null : _scan,
                icon: const Icon(LucideIcons.scanQrCode),
                label: const Text('Scan'),
              ),
            ],
          ),
          const SizedBox(height: SajhaSpacing.lg),
          Text('2. Photos of the item', style: text.titleSmall),
          const SizedBox(height: SajhaSpacing.xs),
          Text(
            'At least $minConfirmPhotos, showing any marks or damage. '
            'These are the evidence if there’s a problem later.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: SajhaSpacing.sm),
          PhotoGrid(
            photos: _photos,
            onChanged: (p) => setState(() => _photos = p),
          ),
          const SizedBox(height: SajhaSpacing.md),
          TextField(
            key: const ValueKey('stage-note'),
            controller: _note,
            maxLength: 500,
            maxLines: 2,
            minLines: 1,
            decoration: const InputDecoration(
              labelText: 'Anything to note? (optional)',
            ),
          ),
          const SizedBox(height: SajhaSpacing.md),
          if (_progress != null) ...[
            LinearProgressIndicator(value: _progress),
            const SizedBox(height: SajhaSpacing.sm),
          ],
          FilledButton(
            key: const ValueKey('stage-confirm'),
            onPressed: !ready || _busy ? null : _confirm,
            child: Text(_handover ? 'Confirm handover' : 'Confirm return'),
          ),
        ],
      ),
    );
  }
}
