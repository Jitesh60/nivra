/// Signed-in user, as returned by `/v1/me` and the auth endpoints.
class AppUser {
  const AppUser({
    required this.id,
    required this.phone,
    required this.phoneVerified,
    required this.emailVerified,
    this.email,
    this.name,
    this.city,
    this.bio,
    this.avatarUrl,
    this.idVerified = false,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) => AppUser(
    id: json['id'] as String,
    phone: json['phone'] as String,
    email: json['email'] as String?,
    name: json['name'] as String?,
    phoneVerified: json['phoneVerified'] as bool? ?? false,
    emailVerified: json['emailVerified'] as bool? ?? false,
    city: json['city'] as String?,
    bio: json['bio'] as String?,
    avatarUrl: json['avatarUrl'] as String?,
    idVerified: json['idVerified'] as bool? ?? false,
  );

  final String id;
  final String phone;
  final String? email;
  final String? name;
  final bool phoneVerified;
  final bool emailVerified;
  final String? city;
  final String? bio;

  /// Public URL of the profile photo, or null for the initials avatar.
  final String? avatarUrl;

  /// An admin approved at least one of the user's ID documents.
  final bool idVerified;

  bool get hasName => name != null && name!.trim().isNotEmpty;

  /// "Rahul" from "Rahul Sharma".
  String? get firstName => hasName ? name!.trim().split(' ').first : null;

  /// "RS" from "Rahul Sharma"; "?" without a name.
  String get initials {
    if (!hasName) return '?';
    final parts = name!.trim().split(RegExp(r'\s+'));
    return (parts.first[0] + (parts.length > 1 ? parts.last[0] : ''))
        .toUpperCase();
  }
}

/// A code was sent; verify it with [challengeId].
class OtpChallenge {
  const OtpChallenge({
    required this.challengeId,
    required this.expiresInSec,
    required this.resendAfterSec,
  });

  factory OtpChallenge.fromJson(Map<String, dynamic> json) => OtpChallenge(
    challengeId: json['challengeId'] as String,
    expiresInSec: (json['expiresInSec'] as num).toInt(),
    resendAfterSec: (json['resendAfterSec'] as num).toInt(),
  );

  final String challengeId;
  final int expiresInSec;
  final int resendAfterSec;
}

class LoginResult {
  const LoginResult({
    required this.user,
    required this.isNewUser,
    required this.accessToken,
    required this.refreshToken,
  });

  factory LoginResult.fromJson(Map<String, dynamic> json) => LoginResult(
    user: AppUser.fromJson(json['user'] as Map<String, dynamic>),
    isNewUser: json['isNewUser'] as bool,
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
  );

  final AppUser user;
  final bool isNewUser;
  final String accessToken;
  final String refreshToken;
}

/// One signed-in device, for "Your devices".
class DeviceSession {
  const DeviceSession({
    required this.id,
    required this.createdAt,
    required this.lastUsedAt,
    required this.current,
    this.deviceName,
    this.platform,
  });

  factory DeviceSession.fromJson(Map<String, dynamic> json) => DeviceSession(
    id: json['id'] as String,
    deviceName: json['deviceName'] as String?,
    platform: json['platform'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
    lastUsedAt: DateTime.parse(json['lastUsedAt'] as String),
    current: json['current'] as bool,
  );

  final String id;
  final String? deviceName;
  final String? platform;
  final DateTime createdAt;
  final DateTime lastUsedAt;
  final bool current;
}
