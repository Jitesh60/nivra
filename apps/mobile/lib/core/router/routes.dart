abstract final class Routes {
  static const splash = '/';
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const loginVerify = '/login/verify';
  static const setupName = '/setup/name';
  static const setupEmail = '/setup/email';
  static const setupEmailVerify = '/setup/email/verify';
  static const home = '/home';
  static const settings = '/settings';
  static const devices = '/settings/devices';
  static const profile = '/profile';
  static const documents = '/documents';
  static const documentsAdd = '/documents/add';
  static const documentView = '/documents/view';
  static const myListings = '/listings';
  static const newListing = '/listings/new';
  static const editListing = '/listings/edit';
  static const listingPreview = '/listings/preview';
  static const search = '/search';
  static const areaPicker = '/area';
  static const wishlist = '/wishlist';

  /// A listing's public page. `/item/`, not `/listings/`, which is the
  /// lender's own space.
  static const itemPattern = '/item/:id';

  /// [book]: a guest tapped "Request to book" for these dates; after
  /// sign-in the item page opens the request again.
  static String item(
    String id, {
    bool save = false,
    bool chat = false,
    ({String from, String to})? book,
  }) =>
      '/item/$id${save
          ? '?save=1'
          : chat
          ? '?chat=1'
          : book != null
          ? '?book=1&from=${book.from}&to=${book.to}'
          : ''}';

  static const inbox = '/inbox';
  static const chatPattern = '/chat/:id';
  static String chat(String conversationId) => '/chat/$conversationId';

  static const bookings = '/bookings';
  static const bookingPattern = '/booking/:id';
  static String booking(String id) => '/booking/$id';
  static const bookingSharePattern = '/booking/:id/share';
  static String bookingShare(String id) => '/booking/$id/share';

  /// After the checkout, confirming the payment (the result in `extra`).
  static const bookingPayingPattern = '/booking/:id/paying';
  static String bookingPaying(String id) => '/booking/$id/paying';

  static const earnings = '/earnings';
  static const payouts = '/payouts';

  /// A document shared with the lender (args in `extra`).
  static const bookingDocument = '/booking-document';
  static const notifications = '/notifications';

  /// The sign-in screens.
  static const public = {onboarding, login, loginVerify};

  /// What guests can browse once they've seen onboarding.
  static bool isBrowse(String location) =>
      location == home ||
      location == search ||
      location == areaPicker ||
      location.startsWith('/item/');
}
