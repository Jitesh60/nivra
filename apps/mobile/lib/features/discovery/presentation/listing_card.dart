import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/router/sign_in_return.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/data/models.dart';
import '../application/discovery_providers.dart';
import '../data/models.dart';

/// A listing in a feed, search results or the wishlist. Opens its page.
class ListingCardTile extends StatelessWidget {
  const ListingCardTile({required this.card, super.key});

  final ListingCard card;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final withDates = card.rentPaise != null && card.days != null;

    return Opacity(
      opacity: card.available ? 1 : 0.55,
      child: InkWell(
        key: ValueKey('card-${card.id}'),
        borderRadius: BorderRadius.circular(SajhaRadius.lg),
        onTap: () => context.push(Routes.item(card.id)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 4 / 3,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(SajhaRadius.lg),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    _Thumb(url: card.thumbUrl),
                    Positioned(
                      top: 2,
                      right: 2,
                      child: SaveButton(
                        listingId: card.id,
                        loadedSaved: card.saved,
                        onPhoto: true,
                      ),
                    ),
                    if (!card.available)
                      const Positioned(
                        left: SajhaSpacing.sm,
                        bottom: SajhaSpacing.sm,
                        child: _Pill('No longer available'),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: SajhaSpacing.sm),
            Text(
              card.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: text.titleSmall,
            ),
            const SizedBox(height: 2),
            Text.rich(
              TextSpan(
                children: [
                  ...withDates
                      ? [
                          TextSpan(
                            text: formatRupees(card.rentPaise!),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          TextSpan(
                            text:
                                ' for ${card.days} ${card.days == 1 ? 'day' : 'days'}',
                          ),
                        ]
                      : [
                          TextSpan(
                            text: formatRupees(card.pricePerDayPaise),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          const TextSpan(text: ' / day'),
                        ],
                  if (ratingLine(card.ratingAvg, card.ratingCount)
                      case final rating?)
                    TextSpan(
                      text: '  $rating',
                      style: TextStyle(color: muted, fontSize: 12),
                    ),
                ],
              ),
              style: text.bodyMedium,
            ),
            if (card.placeLine.isNotEmpty)
              Row(
                children: [
                  if (card.lender.idVerified) ...[
                    const Icon(
                      Icons.verified,
                      size: 14,
                      color: SajhaColors.brand600,
                      semanticLabel: 'ID-verified lender',
                    ),
                    const SizedBox(width: 2),
                  ],
                  Expanded(
                    child: Text(
                      card.placeLine,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: text.bodySmall?.copyWith(color: muted),
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

class _Thumb extends StatelessWidget {
  const _Thumb({this.url});
  final String? url;

  @override
  Widget build(BuildContext context) {
    const placeholder = ColoredBox(
      color: SajhaColors.ink100,
      child: Center(child: Icon(Icons.image_outlined)),
    );
    if (url == null) return placeholder;
    return Image.network(
      url!,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => placeholder,
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: Colors.black87,
      borderRadius: BorderRadius.circular(SajhaRadius.full),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: SajhaSpacing.sm),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 12),
      ),
    ),
  );
}

/// The heart. Guests are sent to sign in, then back to the item, saved.
class SaveButton extends ConsumerWidget {
  const SaveButton({
    required this.listingId,
    required this.loadedSaved,
    this.onPhoto = false,
    super.key,
  });

  final String listingId;

  /// What the API said when the card or page loaded.
  final bool loadedSaved;

  /// Drawn over a photo: gets a backdrop so it stays visible.
  final bool onPhoto;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final saved = ref.watch(
      savedListingsProvider.select((m) => m[listingId] ?? loadedSaved),
    );

    Future<void> onTap() async {
      if (!ref.read(signedInProvider)) {
        requireSignIn(context, ref, Routes.item(listingId, save: true));
        return;
      }
      final messenger = ScaffoldMessenger.of(context);
      try {
        await ref
            .read(savedListingsProvider.notifier)
            .toggle(listingId, currentlySaved: saved);
        messenger.hideCurrentSnackBar();
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              saved ? 'Removed from wishlist' : 'Saved to wishlist',
            ),
          ),
        );
      } on ApiException catch (e) {
        messenger.showSnackBar(SnackBar(content: Text(e.friendlyMessage)));
      }
    }

    final icon = Icon(
      saved ? Icons.favorite : Icons.favorite_border,
      color: saved ? SajhaColors.accent600 : (onPhoto ? Colors.white : null),
    );
    return IconButton(
      key: ValueKey('save-$listingId'),
      tooltip: saved ? 'Remove from wishlist' : 'Save to wishlist',
      style: onPhoto
          ? IconButton.styleFrom(backgroundColor: Colors.black38)
          : null,
      onPressed: onTap,
      icon: icon,
    );
  }
}

/// Cards in a two-column grid, as a sliver.
class CardGrid extends StatelessWidget {
  const CardGrid({required this.cards, super.key});

  final List<ListingCard> cards;

  @override
  Widget build(BuildContext context) => SliverPadding(
    padding: const EdgeInsets.all(SajhaSpacing.md),
    sliver: SliverGrid.builder(
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 240,
        mainAxisExtent: 250,
        crossAxisSpacing: SajhaSpacing.md,
        mainAxisSpacing: SajhaSpacing.md,
      ),
      itemCount: cards.length,
      itemBuilder: (_, i) => ListingCardTile(card: cards[i]),
    ),
  );
}

/// A titled, horizontally scrolling row of cards for the home feed.
class CardRow extends StatelessWidget {
  const CardRow({
    required this.title,
    required this.cards,
    this.onSeeAll,
    super.key,
  });

  final String title;
  final List<ListingCard> cards;
  final VoidCallback? onSeeAll;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(
          SajhaSpacing.lg,
          SajhaSpacing.lg,
          SajhaSpacing.sm,
          SajhaSpacing.sm,
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            if (onSeeAll != null)
              TextButton(onPressed: onSeeAll, child: const Text('See all')),
          ],
        ),
      ),
      SizedBox(
        height: 236,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: SajhaSpacing.lg),
          itemCount: cards.length,
          separatorBuilder: (_, _) => const SizedBox(width: SajhaSpacing.md),
          itemBuilder: (_, i) =>
              SizedBox(width: 164, child: ListingCardTile(card: cards[i])),
        ),
      ),
    ],
  );
}
