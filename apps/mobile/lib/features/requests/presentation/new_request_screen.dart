import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/date_range_chooser.dart';
import '../../../shared/widgets/verify_email_dialog.dart';
import '../../discovery/application/search_area.dart';
import '../../discovery/presentation/area_sheet.dart';
import '../../listings/data/listings_repository.dart';
import '../../listings/data/models.dart';
import '../../listings/presentation/listing_detail_view.dart' show formatRange;
import '../application/requests_providers.dart';
import '../data/models.dart';
import '../data/requests_repository.dart';

/// Ask the community for something you can't find: lenders nearby hear
/// about it and can offer one of their listings.
class NewRequestScreen extends ConsumerStatefulWidget {
  const NewRequestScreen({super.key});

  @override
  ConsumerState<NewRequestScreen> createState() => _NewRequestScreenState();
}

class _NewRequestScreenState extends ConsumerState<NewRequestScreen> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _details = TextEditingController();
  final _budget = TextEditingController();
  TextEditingController? _areaLabel;
  String? _categoryId;
  BlockedRange? _dates;
  bool _posting = false;

  @override
  void dispose() {
    _title.dispose();
    _details.dispose();
    _budget.dispose();
    _areaLabel?.dispose();
    super.dispose();
  }

  Future<void> _chooseDates() async {
    final first = today();
    final range = await ref.read(dateRangeChooserProvider)(
      context,
      first: first,
      last: first.add(const Duration(days: 365)),
      initial: _dates == null
          ? null
          : DateTimeRange(start: _dates!.start, end: _dates!.end),
    );
    if (range != null) {
      setState(() => _dates = BlockedRange(range.start, range.end));
    }
  }

  Future<void> _post(SearchArea area) async {
    if (!_form.currentState!.validate()) return;
    final budget = int.tryParse(_budget.text.trim());
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() => _posting = true);
    try {
      await ref
          .read(requestsRepositoryProvider)
          .create(
            NewRequest(
              title: _title.text.trim(),
              details: _details.text.trim(),
              categoryId: _categoryId,
              dates: _dates,
              budgetPerDayPaise: budget == null ? null : budget * 100,
              lat: area.lat,
              lng: area.lng,
              areaLabel: _areaLabel!.text.trim(),
            ),
          );
      ref.invalidate(myRequestsProvider);
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Request posted. We’ll let lenders nearby know.'),
        ),
      );
      router.pushReplacement(Routes.myRequests);
    } on ApiException catch (e) {
      if (e.code == 'VERIFICATION_REQUIRED' && mounted) {
        await askToVerifyEmail(
          context,
          why:
              'Requests go to people nearby, so they need a verified phone '
              'and email.',
        );
      } else {
        messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final area = ref.watch(searchAreaProvider).value;
    final categories = ref.watch(categoriesProvider).value ?? const [];
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final text = Theme.of(context).textTheme;
    if (area != null) _areaLabel ??= TextEditingController(text: area.label);

    return Scaffold(
      appBar: AppBar(title: const Text('Ask for something')),
      body: area == null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(SajhaSpacing.xl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Set your area first, so we can ask lenders near you.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: SajhaSpacing.md),
                    FilledButton.tonal(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 44),
                      ),
                      onPressed: () => showAreaSheet(context),
                      child: const Text('Set your area'),
                    ),
                  ],
                ),
              ),
            )
          : Form(
              key: _form,
              child: ListView(
                padding: const EdgeInsets.all(SajhaSpacing.lg),
                children: [
                  Text(
                    'Tell lenders nearby what you need. They can offer one of '
                    'their listings, and you’ll chat before booking.',
                    style: text.bodyMedium?.copyWith(color: muted),
                  ),
                  const SizedBox(height: SajhaSpacing.lg),
                  TextFormField(
                    key: const ValueKey('request-title'),
                    controller: _title,
                    maxLength: 80,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'What do you need?',
                      hintText: 'e.g. A 4-person tent',
                      counterText: '',
                    ),
                    validator: (v) => (v ?? '').trim().length < 3
                        ? 'Say what you need in a few words'
                        : null,
                  ),
                  const SizedBox(height: SajhaSpacing.md),
                  TextFormField(
                    key: const ValueKey('request-details'),
                    controller: _details,
                    maxLength: 500,
                    minLines: 2,
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'Details',
                      hintText: 'What it’s for, size, anything that matters',
                      alignLabelWithHint: true,
                    ),
                    validator: (v) => (v ?? '').trim().isEmpty
                        ? 'Add a line about what it’s for'
                        : null,
                  ),
                  const SizedBox(height: SajhaSpacing.md),
                  DropdownButtonFormField<String?>(
                    key: const ValueKey('request-category'),
                    isExpanded: true,
                    initialValue: _categoryId,
                    decoration: const InputDecoration(
                      labelText: 'Category (optional)',
                    ),
                    items: [
                      const DropdownMenuItem(
                        value: null,
                        child: Text('Any category'),
                      ),
                      for (final c in categories)
                        DropdownMenuItem(value: c.id, child: Text(c.name)),
                    ],
                    onChanged: (v) => setState(() => _categoryId = v),
                  ),
                  const SizedBox(height: SajhaSpacing.md),
                  InputDecorator(
                    decoration: const InputDecoration(
                      labelText: 'Dates (optional)',
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            _dates == null ? 'Any dates' : formatRange(_dates!),
                          ),
                        ),
                        if (_dates != null)
                          IconButton(
                            tooltip: 'Any dates',
                            icon: const Icon(LucideIcons.x),
                            onPressed: () => setState(() => _dates = null),
                          ),
                        TextButton(
                          key: const ValueKey('request-dates'),
                          onPressed: _chooseDates,
                          child: Text(_dates == null ? 'Choose' : 'Change'),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: SajhaSpacing.md),
                  TextFormField(
                    key: const ValueKey('request-budget'),
                    controller: _budget,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(
                      labelText: 'Budget per day (optional)',
                      prefixText: '₹ ',
                    ),
                  ),
                  const SizedBox(height: SajhaSpacing.md),
                  TextFormField(
                    key: const ValueKey('request-area'),
                    controller: _areaLabel,
                    maxLength: 80,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      labelText: 'Area',
                      hintText: 'e.g. Kothrud, Pune',
                      helperText:
                          'Shown to lenders. Your exact location isn’t.',
                      counterText: '',
                    ),
                    validator: (v) => (v ?? '').trim().length < 2
                        ? 'Name your area, e.g. Kothrud, Pune'
                        : null,
                  ),
                  const SizedBox(height: SajhaSpacing.lg),
                  FilledButton(
                    key: const ValueKey('post-request'),
                    onPressed: _posting ? null : () => _post(area),
                    child: Text(_posting ? 'Posting…' : 'Post request'),
                  ),
                  const SizedBox(height: SajhaSpacing.sm),
                  Text(
                    'You can close it any time from My requests.',
                    textAlign: TextAlign.center,
                    style: text.bodySmall?.copyWith(color: muted),
                  ),
                ],
              ),
            ),
    );
  }
}
