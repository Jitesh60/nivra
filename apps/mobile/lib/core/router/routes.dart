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
  static String item(String id, {bool save = false, bool chat = false}) =>
      '/item/$id${save
          ? '?save=1'
          : chat
          ? '?chat=1'
          : ''}';

  static const inbox = '/inbox';
  static const chatPattern = '/chat/:id';
  static String chat(String conversationId) => '/chat/$conversationId';

  /// The sign-in screens.
  static const public = {onboarding, login, loginVerify};

  /// What guests can browse once they've seen onboarding.
  static bool isBrowse(String location) =>
      location == home ||
      location == search ||
      location == areaPicker ||
      location.startsWith('/item/');
}
