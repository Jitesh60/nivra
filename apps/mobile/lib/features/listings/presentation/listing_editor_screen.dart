import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/listing_draft.dart';
import '../application/listing_editor.dart';
import '../data/listings_repository.dart';
import '../data/models.dart';
import 'listing_steps.dart';

/// Create a listing (no [existing]) or edit one, step by step.
class ListingEditorScreen extends StatelessWidget {
  const ListingEditorScreen({this.existing, super.key});
  final MyListing? existing;

  @override
  Widget build(BuildContext context) => ProviderScope(
    overrides: [
      listingEditorSeedProvider.overrideWithValue(
        existing == null
            ? const ListingDraft()
            : ListingDraft.fromListing(existing!),
      ),
      listingEditorProvider,
    ],
    child: _Editor(existing: existing),
  );
}

class _Editor extends ConsumerStatefulWidget {
  const _Editor({this.existing});
  final MyListing? existing;

  @override
  ConsumerState<_Editor> createState() => _EditorState();
}

class _EditorState extends ConsumerState<_Editor> {
  var _step = ListingStep.photos;
  List<String> _problems = const [];
  ({String label, double progress})? _saving;

  void _go(int delta, MarketRules rules) {
    if (delta > 0) {
      final problems = validateStep(
        _step,
        ref.read(listingEditorProvider),
        rules,
      );
      if (problems.isNotEmpty) {
        setState(() => _problems = problems);
        return;
      }
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _problems = const [];
      _step = ListingStep.values[_step.index + delta];
    });
  }

  Future<void> _save() async {
    setState(() => _saving = (label: 'Saving…', progress: 0));
    try {
      final outcome = await ref
          .read(listingEditorProvider.notifier)
          .save(
            onProgress: (label, p) {
              if (mounted) {
                setState(() => _saving = (label: label, progress: p));
              }
            },
          );
      ref.invalidate(myListingsProvider);
      if (!mounted) return;
      await _done(outcome);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = null);
      final message = e.code == 'VERIFICATION_REQUIRED'
          ? 'Verify your email before listing items.'
          : e.friendlyMessage;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(message)));
    }
  }

  Future<void> _done(SaveOutcome outcome) async {
    final (icon, title, body) = switch (outcome) {
      SaveOutcome.sentForReview => (
        LucideIcons.hourglass,
        'Sent for review',
        'We check every lender’s first listing. You’ll see it go live in '
            'My listings, usually within a day.',
      ),
      SaveOutcome.live => (
        LucideIcons.partyPopper,
        'Your listing is live',
        'Borrowers near you can find it now.',
      ),
      SaveOutcome.saved => (
        LucideIcons.circleCheck,
        'Changes saved',
        'Your listing is up to date.',
      ),
    };
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: Icon(icon, size: 40),
        title: Text(title),
        content: Text(body),
        actions: [
          FilledButton(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => Navigator.pop(context),
            child: const Text('See my listings'),
          ),
        ],
      ),
    );
    if (!mounted) return;
    if (widget.existing == null) {
      context.pushReplacement(Routes.myListings);
    } else {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    final rules = ref.watch(marketRulesProvider);
    final draft = ref.watch(listingEditorProvider);

    return PopScope(
      canPop: _saving == null,
      child: Scaffold(
        appBar: AppBar(
          title: Text(
            widget.existing == null ? 'List an item' : 'Edit listing',
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(28),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                SajhaSpacing.lg,
                0,
                SajhaSpacing.lg,
                SajhaSpacing.sm,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Step ${_step.index + 1} of ${ListingStep.values.length} · ${_step.title}',
                    key: const ValueKey('wizard-step'),
                  ),
                  const SizedBox(height: SajhaSpacing.xs),
                  LinearProgressIndicator(
                    value: (_step.index + 1) / ListingStep.values.length,
                  ),
                ],
              ),
            ),
          ),
        ),
        body: switch ((categories, rules)) {
          (AsyncData(value: final cats), AsyncData(value: final r)) => Column(
            children: [
              if (draft.rejectionReason != null && _step == ListingStep.photos)
                MaterialBanner(
                  leading: const Icon(LucideIcons.info),
                  content: Text('Reviewer’s note: ${draft.rejectionReason}'),
                  actions: const [SizedBox.shrink()],
                ),
              Expanded(
                child: switch (_step) {
                  ListingStep.photos => PhotosStep(rules: r),
                  ListingStep.details => DetailsStep(categories: cats),
                  ListingStep.pricing => PricingStep(rules: r),
                  ListingStep.availability => AvailabilityStep(rules: r),
                  ListingStep.location => const LocationStep(),
                  ListingStep.documents => const DocumentsStep(),
                  ListingStep.preview => PreviewStep(
                    categories: cats,
                    rules: r,
                  ),
                },
              ),
              if (_problems.isNotEmpty)
                Container(
                  key: const ValueKey('step-problems'),
                  width: double.infinity,
                  color: Theme.of(context).colorScheme.errorContainer,
                  padding: const EdgeInsets.all(SajhaSpacing.md),
                  child: Text(
                    _problems.join('\n'),
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.onErrorContainer,
                    ),
                  ),
                ),
              _BottomBar(
                step: _step,
                saving: _saving,
                publish: draft.willPublish,
                onBack: _step.index == 0 ? null : () => _go(-1, r),
                onNext: _step == ListingStep.preview
                    ? (validateStep(ListingStep.preview, draft, r).isEmpty
                          ? _save
                          : null)
                    : () => _go(1, r),
              ),
            ],
          ),
          (AsyncError(:final error), _) ||
          (_, AsyncError(:final error)) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException
                      ? error.friendlyMessage
                      : 'Something went wrong',
                ),
                TextButton(
                  onPressed: () {
                    ref.invalidate(categoriesProvider);
                    ref.invalidate(marketRulesProvider);
                  },
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _BottomBar extends StatelessWidget {
  const _BottomBar({
    required this.step,
    required this.saving,
    required this.publish,
    required this.onBack,
    required this.onNext,
  });

  final ListingStep step;
  final ({String label, double progress})? saving;
  final bool publish;
  final VoidCallback? onBack;
  final VoidCallback? onNext;

  @override
  Widget build(BuildContext context) {
    final last = step == ListingStep.preview;
    final busy = saving != null;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(SajhaSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy) ...[
              LinearProgressIndicator(value: saving!.progress),
              const SizedBox(height: SajhaSpacing.xs),
              Text(saving!.label, key: const ValueKey('save-progress')),
              const SizedBox(height: SajhaSpacing.sm),
            ],
            Row(
              children: [
                if (onBack != null)
                  OutlinedButton(
                    key: const ValueKey('wizard-back'),
                    onPressed: busy ? null : onBack,
                    child: const Text('Back'),
                  ),
                const Spacer(),
                FilledButton(
                  key: const ValueKey('wizard-next'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size(128, 48),
                  ),
                  onPressed: busy ? null : onNext,
                  child: Text(
                    !last ? 'Next' : (publish ? 'Publish' : 'Save changes'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
