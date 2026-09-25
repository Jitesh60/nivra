import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/router/routes.dart';
import '../../../core/router/sign_in_return.dart';
import '../../../core/theme/tokens.g.dart';
import '../../../shared/widgets/user_avatar.dart';
import '../../../shared/widgets/verify_email_dialog.dart';
import '../../../shared/widgets/verification_badges.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/data/models.dart';
import '../../bookings/application/bookings_providers.dart';
import '../../chat/application/inbox.dart';
import '../../discovery/application/discovery_providers.dart';
import '../../discovery/application/search_area.dart';
import '../../discovery/data/models.dart';
import '../../discovery/presentation/area_sheet.dart';
import '../../discovery/presentation/listing_card.dart';
import '../../listings/presentation/category_icon.dart';
import '../../../shared/widgets/nivra_logo.dart';

/// The borrower's front page: search, the area, categories and feeds.
/// Guests see it too; signed-in users also get verification and lending.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth is Authenticated ? auth.user : null;
    final area = ref.watch(searchAreaProvider).value;
    final feed = ref.watch(homeFeedProvider);
    final recent = ref.watch(recentCardsProvider).value ?? const [];
    final text = Theme.of(context).textTheme;

    Future<void> refresh() async {
      ref
        ..invalidate(homeFeedProvider)
        ..invalidate(recentCardsProvider);
      await ref.read(homeFeedProvider.future).catchError((_) => _emptyFeed);
    }

    return Scaffold(
      appBar: AppBar(
        title: const NivraLogo(size: 30),
        actions: [
          if (user == null)
            TextButton(
              key: const ValueKey('home-sign-in'),
              onPressed: () => requireSignIn(context, ref, Routes.home),
              child: const Text('Sign in'),
            )
          else ...[
            const _InboxButton(),
            const _BellButton(),
            IconButton(
              key: const ValueKey('open-bookings'),
              tooltip: 'My bookings',
              icon: const Icon(LucideIcons.calendarDays),
              onPressed: () => context.push(Routes.bookings),
            ),
            IconButton(
              key: const ValueKey('open-wishlist'),
              tooltip: 'Wishlist',
              icon: const Icon(LucideIcons.heart),
              onPressed: () => context.push(Routes.wishlist),
            ),
            IconButton(
              key: const ValueKey('open-profile'),
              tooltip: 'Profile',
              icon: UserAvatar(user: user, radius: 14),
              onPressed: () => context.push(Routes.profile),
            ),
            IconButton(
              tooltip: 'Settings',
              icon: const Icon(LucideIcons.settings),
              onPressed: () => context.push(Routes.settings),
            ),
          ],
        ],
      ),
      body: RefreshIndicator(
        onRefresh: refresh,
        child: ListView(
          key: const ValueKey('home-feed'),
          padding: const EdgeInsets.only(bottom: SajhaSpacing.x2xl),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                SajhaSpacing.lg,
                SajhaSpacing.sm,
                SajhaSpacing.lg,
                0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    user != null
                        ? 'Hi, ${user.firstName ?? 'there'} 👋'
                        : 'Borrow what you need',
                    style: text.headlineSmall,
                  ),
                  const SizedBox(height: SajhaSpacing.md),
                  _SearchBox(onTap: () => context.push(Routes.search)),
                  const SizedBox(height: SajhaSpacing.sm),
                  ActionChip(
                    key: const ValueKey('area-chip'),
                    avatar: const Icon(LucideIcons.mapPin, size: 18),
                    label: Text(area?.summary ?? 'Set your area'),
                    onPressed: () => showAreaSheet(context),
                  ),
                ],
              ),
            ),
            if (user != null && (!user.emailVerified || !user.idVerified))
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  SajhaSpacing.lg,
                  SajhaSpacing.md,
                  SajhaSpacing.lg,
                  0,
                ),
                child: _VerificationCard(user: user),
              ),
            ...switch (feed) {
              AsyncData(:final value) => _sections(
                context,
                value,
                recent,
                area,
              ),
              AsyncError(:final error) => [
                _FeedError(
                  message: error is ApiException
                      ? error.friendlyMessage
                      : 'Something went wrong.',
                  onRetry: () => ref.invalidate(homeFeedProvider),
                ),
              ],
              _ => [
                const Padding(
                  padding: EdgeInsets.all(SajhaSpacing.x2xl),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ],
            },
            Padding(
              padding: const EdgeInsets.fromLTRB(
                SajhaSpacing.lg,
                SajhaSpacing.xl,
                SajhaSpacing.lg,
                0,
              ),
              child: _LendCard(user: user),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _sections(
    BuildContext context,
    HomeFeed feed,
    List<ListingCard> recent,
    SearchArea? area,
  ) {
    void browse({String? categoryId}) => context.push(
      Uri(
        path: Routes.search,
        queryParameters: {'categoryId': ?categoryId},
      ).toString(),
    );
    final anything =
        feed.nearYou.isNotEmpty ||
        feed.popular.isNotEmpty ||
        feed.newest.isNotEmpty;

    return [
      if (feed.categories.isNotEmpty)
        Padding(
          padding: const EdgeInsets.only(top: SajhaSpacing.md),
          child: SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: SajhaSpacing.lg),
              itemCount: feed.categories.length,
              separatorBuilder: (_, _) =>
                  const SizedBox(width: SajhaSpacing.sm),
              itemBuilder: (_, i) {
                final c = feed.categories[i];
                return ActionChip(
                  key: ValueKey('home-category-${c.slug}'),
                  avatar: Icon(categoryIcon(c.icon), size: 18),
                  label: Text(c.name),
                  onPressed: () => browse(categoryId: c.id),
                );
              },
            ),
          ),
        ),
      if (area == null)
        Padding(
          padding: const EdgeInsets.fromLTRB(
            SajhaSpacing.lg,
            SajhaSpacing.lg,
            SajhaSpacing.lg,
            0,
          ),
          child: Card(
            child: ListTile(
              key: const ValueKey('set-area'),
              leading: const Icon(LucideIcons.navigation),
              title: const Text('See what’s near you'),
              subtitle: const Text(
                'Set your area to find things you can pick up nearby.',
              ),
              onTap: () => showAreaSheet(context),
            ),
          ),
        )
      else if (feed.nearYou.isNotEmpty)
        CardRow(
          key: const ValueKey('section-near'),
          title: 'Near you',
          cards: feed.nearYou,
          onSeeAll: browse,
        ),
      if (feed.popular.isNotEmpty)
        CardRow(
          key: const ValueKey('section-popular'),
          title: 'Popular this week',
          cards: feed.popular,
        ),
      if (recent.isNotEmpty)
        CardRow(
          key: const ValueKey('section-recent'),
          title: 'Recently viewed',
          cards: recent,
        ),
      if (feed.newest.isNotEmpty)
        CardRow(
          key: const ValueKey('section-newest'),
          title: 'New on Nivra',
          cards: feed.newest,
        ),
      if (!anything)
        const Padding(
          padding: EdgeInsets.all(SajhaSpacing.lg),
          child: Text(
            'Nothing listed yet. Be the first: list something you rarely use.',
          ),
        ),
    ];
  }
}

const _emptyFeed = HomeFeed(
  categories: [],
  nearYou: [],
  popular: [],
  newest: [],
);

class _SearchBox extends StatelessWidget {
  const _SearchBox({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest,
      borderRadius: BorderRadius.circular(SajhaRadius.full),
      child: InkWell(
        key: const ValueKey('home-search'),
        borderRadius: BorderRadius.circular(SajhaRadius.full),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: SajhaSpacing.md,
            vertical: 14,
          ),
          child: Row(
            children: [
              Icon(LucideIcons.search, color: scheme.onSurfaceVariant),
              const SizedBox(width: SajhaSpacing.sm),
              Expanded(
                child: Text(
                  'Search tents, cameras, drills…',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeedError extends StatelessWidget {
  const _FeedError({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(SajhaSpacing.lg),
    child: Column(
      children: [
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: SajhaSpacing.sm),
        TextButton(
          key: const ValueKey('home-retry'),
          onPressed: onRetry,
          child: const Text('Try again'),
        ),
      ],
    ),
  );
}

class _VerificationCard extends StatelessWidget {
  const _VerificationCard({required this.user});
  final AppUser user;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SajhaSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Verification', style: text.titleMedium),
            const SizedBox(height: SajhaSpacing.sm),
            VerificationBadges(user: user),
            if (!user.emailVerified) ...[
              const SizedBox(height: SajhaSpacing.md),
              Text(
                'Verify your email to list or rent items.',
                style: text.bodyMedium,
              ),
              const SizedBox(height: SajhaSpacing.sm),
              FilledButton.tonal(
                key: const ValueKey('verify-email'),
                onPressed: () => context.push(Routes.setupEmail),
                child: const Text('Verify email'),
              ),
            ] else ...[
              const SizedBox(height: SajhaSpacing.md),
              Text(
                'Add an ID so lenders know who they’re renting to. '
                'It stays private until you choose to share it.',
                style: text.bodyMedium,
              ),
              const SizedBox(height: SajhaSpacing.sm),
              FilledButton.tonal(
                key: const ValueKey('add-id'),
                onPressed: () => context.push(Routes.documents),
                child: const Text('Add an ID'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _LendCard extends ConsumerWidget {
  const _LendCard({required this.user});
  final AppUser? user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final user = this.user;
    // The theme's buttons are full-width; these sit in a row.
    final rowButton = FilledButton.styleFrom(minimumSize: const Size(0, 48));

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(SajhaSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Lend your things', style: text.titleMedium),
            const SizedBox(height: SajhaSpacing.xs),
            Text(
              'Earn from gear you rarely use. You set the price, dates '
              'and deposit.',
              style: text.bodyMedium,
            ),
            const SizedBox(height: SajhaSpacing.md),
            if (user == null)
              FilledButton.icon(
                key: const ValueKey('guest-lend'),
                style: rowButton,
                onPressed: () => requireSignIn(context, ref, Routes.home),
                icon: const Icon(LucideIcons.logIn),
                label: const Text('Sign in to lend'),
              )
            else
              Wrap(
                spacing: SajhaSpacing.sm,
                runSpacing: SajhaSpacing.sm,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  FilledButton.icon(
                    key: const ValueKey('list-item'),
                    style: rowButton,
                    onPressed: () => user.emailVerified
                        ? context.push(Routes.newListing)
                        : askToVerifyEmail(
                            context,
                            why: 'Lenders need a verified phone and email, so borrowers can trust them.',
                          ),
                    icon: const Icon(LucideIcons.plus),
                    label: const Text('List an item'),
                  ),
                  TextButton(
                    key: const ValueKey('my-listings'),
                    onPressed: () => context.push(Routes.myListings),
                    child: const Text('My listings'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

/// The chats, with a badge for unread ones.
class _InboxButton extends ConsumerWidget {
  const _InboxButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    return IconButton(
      key: const ValueKey('open-inbox'),
      tooltip: unread == 0 ? 'Chats' : 'Chats, $unread unread',
      onPressed: () => context.push(Routes.inbox),
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text('$unread', key: const ValueKey('inbox-badge')),
        child: const Icon(LucideIcons.messageCircle),
      ),
    );
  }
}

/// Booking news, with a badge for unread ones.
class _BellButton extends ConsumerWidget {
  const _BellButton();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(unreadNotificationsProvider).value ?? 0;
    return IconButton(
      key: const ValueKey('open-notifications'),
      tooltip: unread == 0 ? 'Notifications' : 'Notifications, $unread unread',
      onPressed: () => context.push(Routes.notifications),
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text('$unread', key: const ValueKey('bell-badge')),
        child: const Icon(LucideIcons.bell),
      ),
    );
  }
}
