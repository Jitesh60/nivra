import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/theme/tokens.g.dart';
import '../application/discovery_providers.dart';
import 'listing_card.dart';

/// Saved listings, newest first. Items taken down since stay, marked.
class WishlistScreen extends ConsumerWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wishlist = ref.watch(wishlistProvider);
    // Hearts tapped here hide the card straight away.
    final overlay = ref.watch(savedListingsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Wishlist')),
      body: switch (wishlist) {
        AsyncData(:final value) => () {
          final cards = [
            for (final c in value)
              if (overlay[c.id] ?? true) c,
          ];
          if (cards.isEmpty) {
            return Center(
              key: const ValueKey('wishlist-empty'),
              child: Padding(
                padding: const EdgeInsets.all(SajhaSpacing.xl),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      LucideIcons.heart,
                      size: 48,
                      color: SajhaColors.ink400,
                    ),
                    const SizedBox(height: SajhaSpacing.md),
                    Text(
                      'Nothing saved yet',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: SajhaSpacing.xs),
                    const Text(
                      'Tap the heart on anything you might want to rent.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: SajhaSpacing.md),
                    FilledButton.tonal(
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 44),
                      ),
                      onPressed: () => context.go(Routes.home),
                      child: const Text('Start browsing'),
                    ),
                  ],
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(wishlistProvider.future),
            child: CustomScrollView(slivers: [CardGrid(cards: cards)]),
          );
        }(),
        AsyncError(:final error) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error is ApiException
                    ? error.friendlyMessage
                    : 'Something went wrong.',
              ),
              TextButton(
                onPressed: () => ref.invalidate(wishlistProvider),
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
