import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/router/sign_in_return.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/date_range_chooser.dart';
import '../../listings/data/models.dart';
import '../../listings/presentation/listing_detail_view.dart';
import '../application/discovery_providers.dart';
import '../application/saved_searches.dart';
import '../application/search_area.dart';
import '../data/discovery_repository.dart';
import '../data/models.dart';
import '../data/saved_searches.dart';
import 'area_sheet.dart';
import 'filters_sheet.dart';
import 'listing_card.dart';

/// Keywords, area, dates, filters and sort, with results that load as you
/// scroll.
class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({
    this.initialQuery = '',
    this.initialCategoryId,
    super.key,
  });

  final String initialQuery;
  final String? initialCategoryId;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late SearchFilters _filters = SearchFilters(
    query: widget.initialQuery,
    categoryId: widget.initialCategoryId,
  );
  late final _query = TextEditingController(text: widget.initialQuery);
  final _scroll = ScrollController();

  final _items = <ListingCard>[];
  String? _cursor;
  SearchSort? _appliedSort;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  /// This search (as it is now) was saved; any change makes it a new one.
  bool _saved = false;
  bool _saving = false;

  /// Bumped per search, so a slow older response can't overwrite a newer one.
  int _generation = 0;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_maybeLoadMore);
    WidgetsBinding.instance.addPostFrameCallback((_) => _search());
  }

  @override
  void dispose() {
    _query.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final generation = ++_generation;
    setState(() {
      _loading = true;
      _error = null;
      _saved = false;
    });
    try {
      final area = await _area();
      final page = await ref
          .read(discoveryRepositoryProvider)
          .search(_filters, area: area);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items
          ..clear()
          ..addAll(page.items);
        _cursor = page.nextCursor;
        _appliedSort = page.sort;
        _loading = false;
      });
      if (_scroll.hasClients) _scroll.jumpTo(0);
      _fillScreen();
    } on ApiException catch (e) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _error = e.friendlyMessage;
        _loading = false;
      });
    }
  }

  /// The current area. Once loaded, read the state itself: its `future`
  /// still holds the first value after the area changes.
  Future<SearchArea?> _area() async {
    final area = ref.read(searchAreaProvider);
    return area.hasValue ? area.value : ref.read(searchAreaProvider.future);
  }

  void _maybeLoadMore() {
    if (_scroll.position.extentAfter < 600) _loadMore();
  }

  /// A page that doesn't fill a tall screen can't be scrolled to load more,
  /// so load the next one straight away.
  void _fillScreen() => WidgetsBinding.instance.addPostFrameCallback((_) {
    if (mounted && _scroll.hasClients) _maybeLoadMore();
  });

  Future<void> _loadMore() async {
    final cursor = _cursor;
    if (cursor == null || _loading || _loadingMore) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final area = await _area();
      final page = await ref
          .read(discoveryRepositoryProvider)
          .search(_filters, area: area, cursor: cursor);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items.addAll(page.items);
        _cursor = page.nextCursor;
      });
      _fillScreen();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _update(SearchFilters next) {
    setState(() => _filters = next);
    _search();
  }

  Future<void> _chooseDates() async {
    final first = today();
    final range = await ref.read(dateRangeChooserProvider)(
      context,
      first: first,
      last: first.add(const Duration(days: 365)),
      initial: _filters.dates == null
          ? null
          : DateTimeRange(
              start: _filters.dates!.start,
              end: _filters.dates!.end,
            ),
    );
    if (range == null) return;
    _update(
      _filters.copyWith(dates: () => BlockedRange(range.start, range.end)),
    );
  }

  /// Guests sign in first and come back to the same keywords and category.
  Future<void> _save(SearchArea area) async {
    if (!ref.read(signedInProvider)) {
      requireSignIn(
        context,
        ref,
        Uri(
          path: Routes.search,
          queryParameters: {
            if (_filters.query.trim().isNotEmpty) 'q': _filters.query.trim(),
            'categoryId': ?_filters.categoryId,
          },
        ).toString(),
      );
      return;
    }
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    setState(() => _saving = true);
    try {
      await ref
          .read(savedSearchesRepositoryProvider)
          .create(SavedSearchFilters.from(_filters, area));
      ref.invalidate(savedSearchesProvider);
      if (mounted) setState(() => _saved = true);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: const Text(
              'Search saved. We’ll tell you about new listings.',
            ),
            action: SnackBarAction(
              label: 'View',
              onPressed: () => router.push(Routes.savedSearches),
            ),
          ),
        );
    } on ApiException catch (e) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _openFilters() async {
    final next = await showFiltersSheet(context, _filters);
    if (next != null) _update(next);
  }

  @override
  Widget build(BuildContext context) {
    final area = ref.watch(searchAreaProvider).value;
    // A new area or distance means new results.
    ref.listen(searchAreaProvider, (prev, next) {
      if (prev == null || prev.isLoading) return; // First load: _search waits.
      final (a, b) = (prev.value, next.value);
      if ((a?.lat, a?.lng, a?.radiusKm) != (b?.lat, b?.lng, b?.radiusKm)) {
        _search();
      }
    });

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: TextField(
          key: const ValueKey('search-input'),
          controller: _query,
          autofocus:
              widget.initialQuery.isEmpty && widget.initialCategoryId == null,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            hintText: 'Search Sajha',
            border: InputBorder.none,
            filled: false,
            suffixIcon: _query.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear',
                    icon: const Icon(Icons.close),
                    onPressed: () {
                      _query.clear();
                      _update(_filters.copyWith(query: ''));
                    },
                  ),
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (q) => _update(_filters.copyWith(query: q)),
        ),
        actions: [
          // Alerts need a place to watch, so saving needs an area.
          if (area != null)
            IconButton(
              key: const ValueKey('save-search'),
              tooltip: _saved ? 'Search saved' : 'Save search',
              onPressed: _saved || _saving ? null : () => _save(area),
              icon: Icon(_saved ? Icons.bookmark : Icons.bookmark_add_outlined),
            ),
        ],
      ),
      body: Column(
        children: [
          _Toolbar(
            area: area,
            filters: _filters,
            appliedSort: _appliedSort,
            onArea: () => showAreaSheet(context),
            onDates: _chooseDates,
            onClearDates: () => _update(_filters.copyWith(dates: () => null)),
            onFilters: _openFilters,
            onSort: (s) => _update(_filters.copyWith(sort: () => s)),
          ),
          const Divider(height: 1),
          Expanded(child: _results(area)),
        ],
      ),
    );
  }

  Widget _results(SearchArea? area) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return _Message(
        icon: Icons.cloud_off_outlined,
        title: _error!,
        action: TextButton(
          key: const ValueKey('search-retry'),
          onPressed: _search,
          child: const Text('Try again'),
        ),
      );
    }
    if (_items.isEmpty) {
      final canWiden = area != null && area.radiusKm < SearchArea.maxRadiusKm;
      final wider = area == null
          ? 0
          : (area.radiusKm * 2).clamp(
              SearchArea.minRadiusKm,
              SearchArea.maxRadiusKm,
            );
      return _Message(
        key: const ValueKey('search-empty'),
        icon: Icons.search_off,
        title: area != null
            ? 'Nothing found within ${area.radiusKm} km'
            : 'Nothing found',
        body: _filters.activeCount > 0 || _filters.dates != null
            ? 'Try fewer filters or other dates.'
            : 'Try other words, or look a little further out.',
        action: canWiden
            ? FilledButton.tonal(
                key: const ValueKey('widen-radius'),
                style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                onPressed: () =>
                    ref.read(searchAreaProvider.notifier).setRadius(wider),
                child: Text('Search within $wider km'),
              )
            : null,
      );
    }
    return RefreshIndicator(
      onRefresh: _search,
      child: CustomScrollView(
        key: const ValueKey('search-results'),
        controller: _scroll,
        slivers: [
          CardGrid(cards: _items),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(bottom: SajhaSpacing.xl),
              child: Center(
                child: _loadingMore
                    ? const CircularProgressIndicator()
                    : _cursor == null
                    ? Text(
                        '${_items.length} '
                        '${_items.length == 1 ? 'item' : 'items'}',
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Toolbar extends StatelessWidget {
  const _Toolbar({
    required this.area,
    required this.filters,
    required this.appliedSort,
    required this.onArea,
    required this.onDates,
    required this.onClearDates,
    required this.onFilters,
    required this.onSort,
  });

  final SearchArea? area;
  final SearchFilters filters;
  final SearchSort? appliedSort;
  final VoidCallback onArea;
  final VoidCallback onDates;
  final VoidCallback onClearDates;
  final VoidCallback onFilters;
  final ValueChanged<SearchSort> onSort;

  @override
  Widget build(BuildContext context) {
    final sorts = [
      if (area != null) SearchSort.distance,
      if (filters.query.trim().isNotEmpty) SearchSort.relevance,
      SearchSort.priceAsc,
      SearchSort.priceDesc,
      SearchSort.newest,
    ];
    final current = filters.sort ?? appliedSort;
    final count = filters.activeCount;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
        horizontal: SajhaSpacing.md,
        vertical: SajhaSpacing.sm,
      ),
      child: Row(
        children: [
          ActionChip(
            key: const ValueKey('search-area-chip'),
            avatar: const Icon(Icons.place_outlined, size: 18),
            label: Text(area?.summary ?? 'Anywhere'),
            onPressed: onArea,
          ),
          const SizedBox(width: SajhaSpacing.sm),
          if (filters.dates == null)
            ActionChip(
              key: const ValueKey('search-dates'),
              avatar: const Icon(Icons.event_outlined, size: 18),
              label: const Text('Any dates'),
              onPressed: onDates,
            )
          else
            InputChip(
              key: const ValueKey('search-dates'),
              avatar: const Icon(Icons.event_available, size: 18),
              label: Text(formatRange(filters.dates!)),
              onPressed: onDates,
              onDeleted: onClearDates,
              deleteButtonTooltipMessage: 'Any dates',
            ),
          const SizedBox(width: SajhaSpacing.sm),
          ActionChip(
            key: const ValueKey('open-filters'),
            avatar: const Icon(Icons.tune, size: 18),
            label: Text(count == 0 ? 'Filters' : 'Filters · $count'),
            onPressed: onFilters,
          ),
          const SizedBox(width: SajhaSpacing.sm),
          PopupMenuButton<SearchSort>(
            key: const ValueKey('sort-menu'),
            tooltip: 'Sort',
            initialValue: current,
            onSelected: onSort,
            itemBuilder: (_) => [
              for (final s in sorts)
                CheckedPopupMenuItem(
                  key: ValueKey('sort-${s.apiValue}'),
                  value: s,
                  checked: s == current,
                  child: Text(s.label),
                ),
            ],
            child: Chip(
              avatar: const Icon(Icons.sort, size: 18),
              label: Text(current?.label ?? 'Sort'),
            ),
          ),
        ],
      ),
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({
    required this.icon,
    required this.title,
    this.body,
    this.action,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(SajhaSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: SajhaColors.ink400),
          const SizedBox(height: SajhaSpacing.md),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          if (body != null) ...[
            const SizedBox(height: SajhaSpacing.xs),
            Text(body!, textAlign: TextAlign.center),
          ],
          if (action != null) ...[
            const SizedBox(height: SajhaSpacing.md),
            action!,
          ],
        ],
      ),
    ),
  );
}
