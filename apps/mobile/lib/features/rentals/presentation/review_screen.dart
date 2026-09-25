import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/tokens.g.dart';
import '../../bookings/application/bookings_providers.dart';
import '../data/rentals_repository.dart';

/// Rate the other person after the rental. Double-blind: they can't see it
/// until they've rated you too (or a week has passed), so it can be honest.
class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({required this.bookingId, super.key});

  final String bookingId;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  final _comment = TextEditingController();
  int _rating = 0;
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      final updated = await ref
          .read(rentalsRepositoryProvider)
          .review(widget.bookingId, rating: _rating, comment: _comment.text);
      ref.read(bookingProvider(widget.bookingId).notifier).replace(updated);
      navigator.pop();
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(content: Text('Thanks for your review')));
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
    final detail = ref.watch(bookingProvider(widget.bookingId)).value;
    final other = detail?.booking.other.firstName ?? 'them';
    final isBorrower = detail?.booking.isBorrower ?? true;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: Text('Rate $other')),
      body: ListView(
        padding: const EdgeInsets.all(SajhaSpacing.lg),
        children: [
          Text(
            isBorrower
                ? 'How was borrowing from $other? Your rating also counts '
                      'towards the item.'
                : 'How was lending to $other?',
            style: text.titleMedium,
          ),
          const SizedBox(height: SajhaSpacing.md),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 1; i <= 5; i++)
                IconButton(
                  key: ValueKey('star-$i'),
                  iconSize: 40,
                  tooltip: '$i ${i == 1 ? 'star' : 'stars'}',
                  color: SajhaColors.warning,
                  icon: Icon(
                    i <= _rating ? LucideIcons.star : LucideIcons.star,
                  ),
                  onPressed: () => setState(() => _rating = i),
                ),
            ],
          ),
          const SizedBox(height: SajhaSpacing.md),
          TextField(
            key: const ValueKey('review-comment'),
            controller: _comment,
            maxLength: 500,
            maxLines: 4,
            minLines: 2,
            decoration: const InputDecoration(
              labelText: 'A few words (optional)',
            ),
          ),
          Text(
            '$other won’t see your review until they’ve rated you too, or '
            'a week after the rental. You can’t change it later.',
            style: text.bodySmall?.copyWith(color: muted),
          ),
          const SizedBox(height: SajhaSpacing.lg),
          FilledButton(
            key: const ValueKey('review-submit'),
            onPressed: _rating == 0 || _busy ? null : _submit,
            child: const Text('Post review'),
          ),
        ],
      ),
    );
  }
}
