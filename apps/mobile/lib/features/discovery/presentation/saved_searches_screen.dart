import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/listings_repository.dart';
import '../../settings/presentation/settings_screen.dart' show confirm;
import '../application/saved_searches.dart';
import '../data/models.dart';
import '../data/saved_searches.dart';
import 'listing_card.dart';

/// Searches the user saved, with alerts for new listings that match.
class SavedSearchesScreen extends ConsumerWidget {
  const SavedSearchesScreen({super.key});

  Future<void> _run(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
    } on ApiException catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    }
  }

  Future<void> _rename(
    BuildContext context,
    WidgetRef ref,
    SavedSearch s,
  ) async {
    final name = await showDialog<String>(
      context: context,
      builder: (_) => _RenameDialog(initial: s.name),
    );
    if (name == null || name == s.name || !context.mounted) return;
    await _run(
      context,
      () => ref.read(savedSearchesProvider.notifier).rename(s.id, name),
    );
  }

  Future<void> _delete(
    BuildContext context,
    WidgetRef ref,
    SavedSearch s,
  ) async {
    final ok = await confirm(
      context,
      title: 'Delete this search?',
      body: 'You’ll stop hearing about new listings for “${s.name}”.',
      action: 'Delete',
      destructive: true,
    );
    if (!ok || !context.mounted) return;
    await _run(
      context,
      () => ref.read(savedSearchesProvider.notifier).delete(s.id),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final searches = ref.watch(savedSearchesProvider);
    final categories = {
      for (final c in ref.watch(categoriesProvider).value ?? const [])
        c.id: c.name,
    };
    return Scaffold(
      appBar: AppBar(title: const Text('Saved searches')),
      body: switch (searches) {
        AsyncData(:final value) when value.isEmpty => const _Empty(),
        AsyncData(:final value) => RefreshIndicator(
          onRefresh: () => ref.refresh(savedSearchesProvider.future),
          child: ListView.separated(
            itemCount: value.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final s = value[i];
              return ListTile(
                key: ValueKey('saved-search-${s.id}'),
                contentPadding: const EdgeInsets.only(
                  left: SajhaSpacing.lg,
                  right: SajhaSpacing.xs,
                ),
                title: Text(s.name),
                subtitle: Text(
                  s.filters.summary(
                    categoryName: categories[s.filters.categoryId],
                  ),
                ),
                onTap: () => context.push(Routes.savedSearch(s.id)),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Tooltip(
                      message: s.alertsEnabled ? 'Alerts on' : 'Alerts off',
                      child: Switch(
                        key: ValueKey('alerts-${s.id}'),
                        value: s.alertsEnabled,
                        onChanged: (on) => _run(
                          context,
                          () => ref
                              .read(savedSearchesProvider.notifier)
                              .setAlerts(s.id, on),
                        ),
                      ),
                    ),
                    PopupMenuButton<String>(
                      key: ValueKey('saved-menu-${s.id}'),
                      tooltip: 'More',
                      onSelected: (action) => action == 'rename'
                          ? _rename(context, ref, s)
                          : _delete(context, ref, s),
                      itemBuilder: (_) => const [
                        PopupMenuItem(
                          key: ValueKey('saved-rename'),
                          value: 'rename',
                          child: Text('Rename'),
                        ),
                        PopupMenuItem(
                          key: ValueKey('saved-delete'),
                          value: 'delete',
                          child: Text('Delete'),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        AsyncError(:final error) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Couldn’t load your searches.',
              ),
              TextButton(
                onPressed: () => ref.invalidate(savedSearchesProvider),
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

class _Empty extends StatelessWidget {
  const _Empty();

  @override
  Widget build(BuildContext context) => Center(
    key: const ValueKey('saved-searches-empty'),
    child: Padding(
      padding: const EdgeInsets.all(SajhaSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.bookmark_border,
            size: 48,
            color: SajhaColors.ink400,
          ),
          const SizedBox(height: SajhaSpacing.md),
          Text(
            'No saved searches yet',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: SajhaSpacing.xs),
          const Text(
            'Search in your area, then tap the bookmark. We’ll tell you when '
            'something new matches.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: SajhaSpacing.md),
          FilledButton.tonal(
            style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
            onPressed: () => context.push(Routes.search),
            child: const Text('Search'),
          ),
        ],
      ),
    ),
  );
}

class _RenameDialog extends StatefulWidget {
  const _RenameDialog({required this.initial});
  final String initial;

  @override
  State<_RenameDialog> createState() => _RenameDialogState();
}

class _RenameDialogState extends State<_RenameDialog> {
  late final _name = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  void _save() {
    final name = _name.text.trim();
    if (name.isNotEmpty) Navigator.pop(context, name);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Rename search'),
    content: TextField(
      key: const ValueKey('rename-input'),
      controller: _name,
      autofocus: true,
      maxLength: 60,
      textCapitalization: TextCapitalization.sentences,
      decoration: const InputDecoration(labelText: 'Name'),
      onSubmitted: (_) => _save(),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      TextButton(
        key: const ValueKey('rename-save'),
        onPressed: _save,
        child: const Text('Save'),
      ),
    ],
  );
}

/// What a saved search finds now.
class SavedSearchResultsScreen extends ConsumerStatefulWidget {
  const SavedSearchResultsScreen({required this.id, super.key});

  final String id;

  @override
  ConsumerState<SavedSearchResultsScreen> createState() =>
      _SavedSearchResultsScreenState();
}

class _SavedSearchResultsScreenState
    extends ConsumerState<SavedSearchResultsScreen> {
  final _items = <ListingCard>[];
  String? _cursor;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load({bool more = false}) async {
    setState(() {
      if (more) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });
    try {
      final page = await ref
          .read(savedSearchesRepositoryProvider)
          .results(widget.id, cursor: more ? _cursor : null);
      if (!mounted) return;
      setState(() {
        if (!more) _items.clear();
        _items.addAll(page.items);
        _cursor = page.nextCursor;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      if (more) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      } else {
        setState(() => _error = e.friendlyMessage);
      }
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final saved = ref
        .watch(savedSearchesProvider)
        .value
        ?.where((s) => s.id == widget.id)
        .firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(saved?.name ?? 'Saved search')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_error!),
                  TextButton(onPressed: _load, child: const Text('Try again')),
                ],
              ),
            )
          : _items.isEmpty
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(SajhaSpacing.xl),
                child: Text(
                  'Nothing matches right now. We’ll tell you when something '
                  'new comes up.',
                  key: ValueKey('saved-results-empty'),
                  textAlign: TextAlign.center,
                ),
              ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: CustomScrollView(
                key: const ValueKey('saved-results'),
                slivers: [
                  CardGrid(cards: _items),
                  if (_cursor != null)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: SajhaSpacing.xl),
                        child: Center(
                          child: _loadingMore
                              ? const CircularProgressIndicator()
                              : TextButton(
                                  onPressed: () => _load(more: true),
                                  child: const Text('Show more'),
                                ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}
