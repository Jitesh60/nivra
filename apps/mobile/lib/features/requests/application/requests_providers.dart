import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../discovery/application/discovery_providers.dart';
import '../../discovery/application/search_area.dart';
import '../data/models.dart';
import '../data/requests_repository.dart';

class RequestBoard {
  const RequestBoard(this.items, this.cursor, {this.loadingMore = false});
  final List<ItemRequest> items;
  final String? cursor;
  final bool loadingMore;
}

/// Open requests near the search area, for one category (null: all).
/// Null when no area is set yet.
class RequestBoardController extends AsyncNotifier<RequestBoard?> {
  RequestBoardController(this.categoryId);

  final String? categoryId;

  RequestsRepository get _repo => ref.read(requestsRepositoryProvider);

  SearchArea? _area;

  @override
  Future<RequestBoard?> build() async {
    final area = _area = await ref.watch(searchAreaProvider.future);
    if (area == null) return null;
    final page = await _repo.board(area, categoryId: categoryId);
    return RequestBoard(page.items, page.nextCursor);
  }

  Future<void> loadMore() async {
    final board = state.value;
    final area = _area;
    if (board == null || area == null) return;
    final cursor = board.cursor;
    if (cursor == null || board.loadingMore) return;
    state = AsyncData(RequestBoard(board.items, cursor, loadingMore: true));
    try {
      final page = await _repo.board(
        area,
        categoryId: categoryId,
        cursor: cursor,
      );
      state = AsyncData(
        RequestBoard([...board.items, ...page.items], page.nextCursor),
      );
    } catch (_) {
      state = AsyncData(board);
      rethrow;
    }
  }
}

final requestBoardProvider = AsyncNotifierProvider.autoDispose
    .family<RequestBoardController, RequestBoard?, String?>(
      RequestBoardController.new,
      retry: noRetry,
    );

final myRequestsProvider = FutureProvider.autoDispose<List<ItemRequestDetail>>(
  (ref) => ref.watch(requestsRepositoryProvider).mine(),
  retry: noRetry,
);

final requestProvider = FutureProvider.autoDispose
    .family<ItemRequestDetail, String>(
      (ref, id) => ref.watch(requestsRepositoryProvider).get(id),
      retry: noRetry,
    );
