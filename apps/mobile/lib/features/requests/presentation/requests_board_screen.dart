import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../../discovery/application/search_area.dart';
import '../../discovery/presentation/area_sheet.dart';
import '../../listings/data/listings_repository.dart';
import '../../listings/presentation/category_icon.dart';
import '../application/requests_providers.dart';
import 'request_tile.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/sajha_button.dart';

/// What people nearby are looking for. Lenders offer one of their listings;
/// anyone can ask for something.
class RequestsBoardScreen extends ConsumerStatefulWidget {
  const RequestsBoardScreen({super.key});

  @override
  ConsumerState<RequestsBoardScreen> createState() =>
      _RequestsBoardScreenState();
}

class _RequestsBoardScreenState extends ConsumerState<RequestsBoardScreen> {
  String? _categoryId;

  Future<void> _loadMore() async {
    try {
      await ref.read(requestBoardProvider(_categoryId).notifier).loadMore();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final area = ref.watch(searchAreaProvider).value;
    final board = ref.watch(requestBoardProvider(_categoryId));
    final categories = ref.watch(categoriesProvider).value ?? const [];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Requests nearby'),
        actions: [
          TextButton(
            key: const ValueKey('open-my-requests'),
            onPressed: () => context.push(Routes.myRequests),
            child: const Text('My requests'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const ValueKey('new-request'),
        onPressed: () => context.push(Routes.newRequest),
        icon: const Icon(LucideIcons.plus),
        label: const Text('Ask for something'),
      ),
      body: area == null && !board.isLoading
          ? const _NoArea()
          : Column(
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: SajhaSpacing.md,
                    vertical: SajhaSpacing.sm,
                  ),
                  child: Row(
                    children: [
                      if (area != null) ...[
                        ActionChip(
                          key: const ValueKey('requests-area'),
                          avatar: const Icon(LucideIcons.mapPin, size: 18),
                          label: Text(area.label),
                          onPressed: () => showAreaSheet(context),
                        ),
                        const SizedBox(width: SajhaSpacing.sm),
                      ],
                      ChoiceChip(
                        key: const ValueKey('requests-category-all'),
                        label: const Text('All'),
                        selected: _categoryId == null,
                        onSelected: (_) => setState(() => _categoryId = null),
                      ),
                      for (final c in categories) ...[
                        const SizedBox(width: SajhaSpacing.sm),
                        ChoiceChip(
                          key: ValueKey('requests-category-${c.slug}'),
                          avatar: Icon(categoryIcon(c.icon), size: 18),
                          label: Text(c.name),
                          selected: _categoryId == c.id,
                          onSelected: (_) => setState(() => _categoryId = c.id),
                        ),
                      ],
                    ],
                  ),
                ),
                const Divider(height: 1),
                Expanded(
                  child: switch (board) {
                    AsyncData(:final value?) when value.items.isEmpty =>
                      const Center(
                        child: Padding(
                          padding: EdgeInsets.all(SajhaSpacing.xl),
                          child: Text(
                            'No requests near you right now. Need something? '
                            'Ask, and lenders nearby will offer theirs.',
                            key: ValueKey('requests-empty'),
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
                    AsyncData(:final value?) => RefreshIndicator(
                      onRefresh: () =>
                          ref.refresh(requestBoardProvider(_categoryId).future),
                      child: ListView.separated(
                        key: const ValueKey('requests-board'),
                        padding: const EdgeInsets.fromLTRB(
                          SajhaSpacing.md,
                          SajhaSpacing.md,
                          SajhaSpacing.md,
                          96, // Clear of the button.
                        ),
                        itemCount:
                            value.items.length + (value.cursor == null ? 0 : 1),
                        separatorBuilder: (_, _) =>
                            const SizedBox(height: SajhaSpacing.sm),
                        itemBuilder: (_, i) => i == value.items.length
                            ? Center(
                                child: value.loadingMore
                                    ? const CircularProgressIndicator()
                                    : TextButton(
                                        onPressed: _loadMore,
                                        child: const Text('Show more'),
                                      ),
                              )
                            : RequestTile(request: value.items[i]),
                      ),
                    ),
                    AsyncError(:final error) => Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            error is ApiException
                                ? error.friendlyMessage
                                : 'Couldn’t load requests.',
                          ),
                          TextButton(
                            onPressed: () => ref.invalidate(
                              requestBoardProvider(_categoryId),
                            ),
                            child: const Text('Try again'),
                          ),
                        ],
                      ),
                    ),
                    _ => const Center(child: CircularProgressIndicator()),
                  },
                ),
              ],
            ),
    );
  }
}

class _NoArea extends StatelessWidget {
  const _NoArea();

  @override
  Widget build(BuildContext context) => EmptyState(
    icon: LucideIcons.navigation,
    title: 'Where are you?',
    message: 'Set your area to see what people nearby are looking for.',
    action: SajhaButton(
      key: const ValueKey('requests-set-area'),
      label: 'Set your area',
      variant: SajhaButtonVariant.secondary,
      expand: false,
      onPressed: () => showAreaSheet(context),
    ),
  );
}
