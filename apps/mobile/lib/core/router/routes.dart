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

  /// Reachable without signing in.
  static const public = {onboarding, login, loginVerify};
}
