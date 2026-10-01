import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../core/router/routes.dart';
import '../../core/router/sign_in_return.dart';
import '../../features/chat/application/inbox.dart';
import '../../features/discovery/application/discovery_providers.dart';

/// The five main places, as tabs at the bottom with a label under every
/// icon: Borrow, Lend, Inbox, Bookings, Me. One account borrows and lends.
/// Switching tabs gives the page a short fade so the change is easy to see.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({required this.shell, super.key});

  final StatefulNavigationShell shell;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell>
    with SingleTickerProviderStateMixin {
  late final _fade = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
    value: 1,
  );

  @override
  void didUpdateWidget(AppShell old) {
    super.didUpdateWidget(old);
    if (old.shell.currentIndex != widget.shell.currentIndex &&
        !MediaQuery.disableAnimationsOf(context)) {
      _fade.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  void _select(int index) {
    // Guests can browse; the other tabs need an account.
    if (index != 0 && !ref.read(signedInProvider)) {
      requireSignIn(context, ref, Routes.tabs[index]);
      return;
    }
    // Tapping the current tab again goes back to its first page.
    widget.shell.goBranch(
      index,
      initialLocation: index == widget.shell.currentIndex,
    );
  }

  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(unreadCountProvider).value ?? 0;
    return Scaffold(
      body: FadeTransition(
        opacity: Tween<double>(
          begin: 0.4,
          end: 1,
        ).animate(CurvedAnimation(parent: _fade, curve: Curves.easeOut)),
        child: widget.shell,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: widget.shell.currentIndex,
        onDestinationSelected: _select,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: [
          const NavigationDestination(
            key: ValueKey('tab-borrow'),
            icon: Icon(LucideIcons.compass),
            label: 'Borrow',
          ),
          const NavigationDestination(
            key: ValueKey('tab-lend'),
            icon: Icon(LucideIcons.package),
            label: 'Lend',
          ),
          NavigationDestination(
            key: const ValueKey('tab-inbox'),
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread', key: const ValueKey('inbox-badge')),
              child: const Icon(LucideIcons.messageCircle),
            ),
            label: 'Inbox',
            tooltip: unread == 0 ? 'Inbox' : 'Inbox, $unread unread',
          ),
          const NavigationDestination(
            key: ValueKey('tab-bookings'),
            icon: Icon(LucideIcons.calendarDays),
            label: 'Bookings',
          ),
          const NavigationDestination(
            key: ValueKey('tab-me'),
            icon: Icon(LucideIcons.user),
            label: 'Me',
          ),
        ],
      ),
    );
  }
}
