import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/listings_repository.dart';
import '../data/models.dart';
import 'listing_draft.dart';

enum SaveOutcome {
  /// First listing: waits for an admin.
  sentForReview,

  /// Published straight to LIVE.
  live,

  /// Changes to an already published listing.
  saved,
}

/// Holds the wizard's draft and saves it: create or update, photos (upload,
/// delete, order), blocked dates, documents, then publish when it's new.
class ListingEditor extends Notifier<ListingDraft> {
  @override
  ListingDraft build() => ref.watch(listingEditorSeedProvider);

  ListingsRepository get _repo => ref.read(listingsRepositoryProvider);

  void update(ListingDraft Function(ListingDraft d) change) =>
      state = change(state);

  void addPhotos(List<DraftPhoto> photos) =>
      state = state.copyWith(photos: [...state.photos, ...photos]);

  void removePhoto(DraftPhoto photo) {
    state = state.copyWith(
      photos: state.photos.where((p) => !identical(p, photo)).toList(),
      removedPhotoIds: {
        ...state.removedPhotoIds,
        if (photo is RemotePhoto) photo.photo.id,
      },
    );
  }

  void makeCover(DraftPhoto photo) {
    state = state.copyWith(
      photos: [photo, ...state.photos.where((p) => !identical(p, photo))],
    );
  }

  /// Saves everything; [onProgress] gets a label and 0–1.
  Future<SaveOutcome> save({
    void Function(String label, double progress)? onProgress,
  }) async {
    final draft = state;
    void report(String label, double p) => onProgress?.call(label, p);

    report('Saving details…', 0);
    var listing = draft.isNew
        ? await _repo.create(draft.toFields())
        : await _repo.update(draft.id!, draft.toFields());
    final id = listing.id;
    // Remember the id right away, so a retry after a failure updates
    // instead of creating a second listing.
    state = state.copyWith(id: id, status: listing.status);

    // Photos: new ones first (so a live listing never drops to zero), then
    // removals, then the order the lender chose.
    final local = draft.photos.whereType<LocalPhoto>().toList();
    final ids = <int, String>{};
    for (final (i, photo) in local.indexed) {
      final before = listing.photos.map((p) => p.id).toSet();
      listing = await _repo.addPhoto(
        id,
        photo.bytes,
        onProgress: (p) => report(
          'Uploading photo ${i + 1} of ${local.length}…',
          0.1 + 0.6 * (i + p) / local.length,
        ),
      );
      ids[photo.localId] = listing.photos
          .firstWhere((p) => !before.contains(p.id))
          .id;
    }
    // Keep the editor in sync so a retry doesn't upload twice.
    state = state.copyWith(
      photos: [
        for (final p in state.photos)
          if (p is LocalPhoto && ids.containsKey(p.localId))
            RemotePhoto(
              listing.photos.firstWhere((x) => x.id == ids[p.localId]),
            )
          else
            p,
      ],
    );
    for (final photoId in draft.removedPhotoIds) {
      if (listing.photos.any((p) => p.id == photoId)) {
        listing = await _repo.deletePhoto(id, photoId);
      }
    }
    state = state.copyWith(removedPhotoIds: {});
    final order = [
      for (final p in draft.photos)
        switch (p) {
          RemotePhoto(:final photo) => photo.id,
          LocalPhoto(:final localId) => ids[localId]!,
        },
    ];
    if (order.join() != listing.photos.map((p) => p.id).join()) {
      listing = await _repo.reorderPhotos(id, order);
    }

    report('Saving dates and documents…', 0.8);
    await _repo.setBlocks(id, draft.blocks);
    listing = await _repo.setRequiredDocs(id, draft.requiredDocs);

    if (listing.status == ListingStatus.draft) {
      report('Publishing…', 0.9);
      final result = await _repo.publish(id);
      state = state.copyWith(status: result.listing.status);
      return result.inReview ? SaveOutcome.sentForReview : SaveOutcome.live;
    }
    return SaveOutcome.saved;
  }
}

/// The draft an editor starts from. Each editor screen scopes it (and
/// [listingEditorProvider]) with a ProviderScope, so two editors never share state.
final listingEditorSeedProvider = Provider<ListingDraft>(
  (ref) => const ListingDraft(),
);

final listingEditorProvider =
    NotifierProvider.autoDispose<ListingEditor, ListingDraft>(
      ListingEditor.new,
      dependencies: [listingEditorSeedProvider],
    );
