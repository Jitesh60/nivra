import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/auth_controller.dart';
import '../../features/auth/presentation/email_screen.dart';
import '../../features/auth/presentation/name_screen.dart';
import '../../features/auth/presentation/otp_screens.dart';
import '../../features/auth/presentation/phone_screen.dart';
import '../../features/payments/presentation/earnings_screen.dart';
import '../../features/payments/presentation/payment_processing_screen.dart';
import '../../features/payments/presentation/payouts_screen.dart';
import '../payments/payment_gateway.dart';
import '../../features/bookings/presentation/booking_screen.dart';
import '../../features/bookings/presentation/my_bookings_screen.dart';
import '../../features/bookings/presentation/notifications_screen.dart';
import '../../features/bookings/presentation/request_booking.dart';
import '../../features/bookings/presentation/share_documents_screen.dart';
import '../../features/bookings/presentation/shared_document_screen.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/chat/presentation/inbox_screen.dart';
import '../../features/documents/presentation/add_document_screen.dart';
import '../../features/documents/presentation/document_viewer_screen.dart';
import '../../features/documents/presentation/documents_screen.dart';
import '../../features/discovery/presentation/area_picker_screen.dart';
import '../../features/discovery/presentation/item_screen.dart';
import '../../features/discovery/presentation/search_screen.dart';
import '../../features/discovery/presentation/wishlist_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/listings/data/models.dart';
import '../../features/listings/presentation/listing_editor_screen.dart';
import '../../features/listings/presentation/my_listings_screen.dart';
import '../../features/onboarding/presentation/onboarding_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import '../../features/settings/presentation/devices_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/splash/presentation/splash_screen.dart';
import 'auth_redirect.dart';
import 'routes.dart';
import 'sign_in_return.dart';

/// App routes. Every navigation passes through [authRedirect], and the router
/// re-evaluates it whenever the auth state changes.
final routerProvider = Provider<GoRouter>((ref) {
  final authChanged = ValueNotifier(0);
  ref.listen(authControllerProvider, (_, _) => authChanged.value++);

  late final GoRouter router;
  router = GoRouter(
    initialLocation: Routes.splash,
    refreshListenable: authChanged,
    redirect: (context, state) {
      // When the auth state changes, go_router re-checks the current stack
      // but hands us its bottom page (usually home). Check the page on top
      // instead: settings pushed over home must not outlive a sign-out, and
      // a pushed login must move on once signed in.
      final current = router.routerDelegate.currentConfiguration;
      final recheck = current.isNotEmpty && state.uri == current.uri;
      final location = recheck
          ? router.state.matchedLocation
          : state.matchedLocation;
      final returnTo = ref.read(signInReturnProvider);
      final target = authRedirect(
        ref.read(authControllerProvider),
        location,
        returnTo: returnTo,
      );
      if (returnTo != null && target == returnTo) {
        // Used up. Cleared after this navigation, not during it.
        Future.microtask(ref.read(signInReturnProvider.notifier).clear);
      }
      return target;
    },
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(
        path: Routes.onboarding,
        builder: (_, _) => const OnboardingScreen(),
      ),
      GoRoute(path: Routes.login, builder: (_, _) => const PhoneScreen()),
      GoRoute(
        path: Routes.loginVerify,
        redirect: (_, state) =>
            state.extra is PhoneOtpArgs ? null : Routes.login,
        builder: (_, state) =>
            PhoneOtpScreen(args: state.extra! as PhoneOtpArgs),
      ),
      GoRoute(path: Routes.setupName, builder: (_, _) => const NameScreen()),
      GoRoute(path: Routes.setupEmail, builder: (_, _) => const EmailScreen()),
      GoRoute(
        path: Routes.setupEmailVerify,
        redirect: (_, state) =>
            state.extra is EmailOtpArgs ? null : Routes.setupEmail,
        builder: (_, state) =>
            EmailOtpScreen(args: state.extra! as EmailOtpArgs),
      ),
      GoRoute(path: Routes.home, builder: (_, _) => const HomeScreen()),
      GoRoute(
        path: Routes.search,
        builder: (_, state) => SearchScreen(
          initialQuery: state.uri.queryParameters['q'] ?? '',
          initialCategoryId: state.uri.queryParameters['categoryId'],
        ),
      ),
      GoRoute(
        path: Routes.itemPattern,
        builder: (_, state) => ItemScreen(
          id: state.pathParameters['id']!,
          saveOnOpen: state.uri.queryParameters['save'] == '1',
          chatOnOpen: state.uri.queryParameters['chat'] == '1',
          bookOnOpen: bookDates(state.uri.queryParameters),
        ),
      ),
      GoRoute(
        path: Routes.bookings,
        builder: (_, _) => const MyBookingsScreen(),
      ),
      GoRoute(
        path: Routes.bookingPattern,
        builder: (_, state) =>
            BookingScreen(bookingId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: Routes.bookingSharePattern,
        builder: (_, state) =>
            ShareDocumentsScreen(bookingId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: Routes.bookingPayingPattern,
        redirect: (_, state) => state.extra is CheckoutSuccess
            ? null
            : Routes.booking(state.pathParameters['id']!),
        builder: (_, state) => PaymentProcessingScreen(
          bookingId: state.pathParameters['id']!,
          payment: state.extra! as CheckoutSuccess,
        ),
      ),
      GoRoute(path: Routes.earnings, builder: (_, _) => const EarningsScreen()),
      GoRoute(path: Routes.payouts, builder: (_, _) => const PayoutsScreen()),
      GoRoute(
        path: Routes.bookingDocument,
        redirect: (_, state) =>
            state.extra is SharedDocumentArgs ? null : Routes.bookings,
        builder: (_, state) =>
            SharedDocumentScreen(args: state.extra! as SharedDocumentArgs),
      ),
      GoRoute(
        path: Routes.notifications,
        builder: (_, _) => const NotificationsScreen(),
      ),
      GoRoute(path: Routes.inbox, builder: (_, _) => const InboxScreen()),
      GoRoute(
        path: Routes.chatPattern,
        builder: (_, state) =>
            ChatScreen(conversationId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: Routes.areaPicker,
        builder: (_, _) => const AreaPickerScreen(),
      ),
      GoRoute(path: Routes.wishlist, builder: (_, _) => const WishlistScreen()),
      GoRoute(path: Routes.settings, builder: (_, _) => const SettingsScreen()),
      GoRoute(path: Routes.devices, builder: (_, _) => const DevicesScreen()),
      GoRoute(path: Routes.profile, builder: (_, _) => const ProfileScreen()),
      GoRoute(
        path: Routes.myListings,
        builder: (_, _) => const MyListingsScreen(),
      ),
      GoRoute(
        path: Routes.newListing,
        builder: (_, _) => const ListingEditorScreen(),
      ),
      GoRoute(
        path: Routes.editListing,
        redirect: (_, state) =>
            state.extra is MyListing ? null : Routes.myListings,
        builder: (_, state) =>
            ListingEditorScreen(existing: state.extra! as MyListing),
      ),
      GoRoute(
        path: Routes.listingPreview,
        redirect: (_, state) =>
            state.extra is MyListing ? null : Routes.myListings,
        builder: (_, state) =>
            ListingPreviewScreen(listing: state.extra! as MyListing),
      ),
      GoRoute(
        path: Routes.documents,
        builder: (_, _) => const DocumentsScreen(),
      ),
      GoRoute(
        path: Routes.documentsAdd,
        builder: (_, _) => const AddDocumentScreen(),
      ),
      GoRoute(
        path: Routes.documentView,
        redirect: (_, state) =>
            state.extra is DocumentViewArgs ? null : Routes.documents,
        builder: (_, state) =>
            DocumentViewerScreen(args: state.extra! as DocumentViewArgs),
      ),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    authChanged.dispose();
  });
  return router;
});
