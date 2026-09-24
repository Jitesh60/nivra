import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/app_prefs.dart';
import '../../auth/application/auth_controller.dart';
import '../data/discovery_repository.dart';
import '../data/models.dart';
import 'search_area.dart';

/// API errors aren't retried behind the user's back: the screens show the
/// error with a "Try again" button instead.
Duration? noRetry(int retryCount, Object error) => null;

/// True when signed in. Feeds refetch when it flips, so `saved` flags are right.
final signedInProvider = Provider<bool>(
  (ref) => ref.watch(authControllerProvider) is Authenticated,
);

/// Listing ids the user opened, most recent first. Kept on the device only.
class RecentlyViewed extends AsyncNotifier<List<String>> {
  static const limit = 20;

  @override
  Future<List<String>> build() => ref.read(appPrefsProvider).recentlyViewed();

  Future<void> add(String id) async {
    final current = state.value ?? await future;
    final next = [id, ...current.where((x) => x != id)].take(limit).toList();
    state = AsyncData(next);
    await ref.read(appPrefsProvider).setRecentlyViewed(next);
  }
}

final recentlyViewedProvider =
    AsyncNotifierProvider<RecentlyViewed, List<String>>(RecentlyViewed.new);

final homeFeedProvider = FutureProvider.autoDispose<HomeFeed>((ref) async {
  ref.watch(signedInProvider);
  final area = await ref.watch(searchAreaProvider.future);
  return ref.watch(discoveryRepositoryProvider).home(area: area);
}, retry: noRetry);

final recentCardsProvider = FutureProvider.autoDispose<List<ListingCard>>((
  ref,
) async {
  ref.watch(signedInProvider);
  final ids = await ref.watch(recentlyViewedProvider.future);
  return ref.watch(discoveryRepositoryProvider).cards(ids);
}, retry: noRetry);

final publicListingProvider = FutureProvider.autoDispose
    .family<PublicListing, String>((ref, id) {
      ref.watch(signedInProvider);
      return ref.watch(discoveryRepositoryProvider).listing(id);
    }, retry: noRetry);

final wishlistProvider = FutureProvider.autoDispose<List<ListingCard>>((ref) {
  if (!ref.watch(signedInProvider)) return const [];
  return ref.watch(discoveryRepositoryProvider).wishlist();
}, retry: noRetry);

/// Saves and removals made this session, by listing id. Cards and pages show
/// these over what they loaded, so a heart tapped anywhere is right everywhere.
class SavedListings extends Notifier<Map<String, bool>> {
  @override
  Map<String, bool> build() {
    ref.watch(signedInProvider); // Start over on sign-in or sign-out.
    return const {};
  }

  bool isSaved(String id, {required bool loaded}) => state[id] ?? loaded;

  /// Flips the saved state; rolls back and rethrows if the API refuses.
  Future<void> toggle(String id, {required bool currentlySaved}) async {
    final next = !currentlySaved;
    state = {...state, id: next};
    try {
      final repo = ref.read(discoveryRepositoryProvider);
      await (next ? repo.save(id) : repo.unsave(id));
      ref.invalidate(wishlistProvider);
    } on Object {
      state = {...state, id: currentlySaved};
      rethrow;
    }
  }
}

final savedListingsProvider =
    NotifierProvider<SavedListings, Map<String, bool>>(SavedListings.new);
