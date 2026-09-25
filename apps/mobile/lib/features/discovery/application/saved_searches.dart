import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/saved_searches.dart';
import 'discovery_providers.dart';

/// The user's saved searches, newest first. Switches and renames show at
/// once and are undone if the API refuses (the error is rethrown).
class SavedSearchesController extends AsyncNotifier<List<SavedSearch>> {
  SavedSearchesRepository get _repo =>
      ref.read(savedSearchesRepositoryProvider);

  @override
  Future<List<SavedSearch>> build() async {
    if (!ref.watch(signedInProvider)) return const [];
    return _repo.list();
  }

  Future<void> setAlerts(String id, bool on) =>
      _optimistic(id, (s) => s.copyWith(alertsEnabled: on), alertsEnabled: on);

  Future<void> rename(String id, String name) =>
      _optimistic(id, (s) => s.copyWith(name: name), name: name);

  Future<void> delete(String id) async {
    final before = state.value;
    if (before == null) return;
    state = AsyncData([
      for (final s in before)
        if (s.id != id) s,
    ]);
    try {
      await _repo.delete(id);
    } catch (_) {
      state = AsyncData(before);
      rethrow;
    }
  }

  Future<void> _optimistic(
    String id,
    SavedSearch Function(SavedSearch) change, {
    String? name,
    bool? alertsEnabled,
  }) async {
    final before = state.value;
    if (before == null) return;
    List<SavedSearch> replace(SavedSearch Function(SavedSearch) f) => [
      for (final s in before) s.id == id ? f(s) : s,
    ];
    state = AsyncData(replace(change));
    try {
      final saved = await _repo.update(
        id,
        name: name,
        alertsEnabled: alertsEnabled,
      );
      state = AsyncData(replace((_) => saved));
    } catch (_) {
      state = AsyncData(before);
      rethrow;
    }
  }
}

final savedSearchesProvider =
    AsyncNotifierProvider.autoDispose<
      SavedSearchesController,
      List<SavedSearch>
    >(SavedSearchesController.new, retry: noRetry);
