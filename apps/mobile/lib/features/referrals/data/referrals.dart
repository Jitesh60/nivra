import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../chat/data/models.dart' show ChatParticipant;

DateTime? _dateOrNull(Object? v) =>
    v == null ? null : DateTime.parse(v as String);

enum CreditKind {
  grantReferee('GRANT_REFEREE', 'Welcome credit'),
  grantReferrer('GRANT_REFERRER', 'Invite reward'),
  hold('HOLD', 'Used on a booking'),
  release('RELEASE', 'Given back'),
  revoke('REVOKE', 'Removed by Nivra');

  const CreditKind(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static CreditKind fromApi(String v) =>
      values.firstWhere((k) => k.apiValue == v, orElse: () => revoke);
}

/// One line in the invite credit history. [amountPaise] is signed.
class CreditEntry {
  const CreditEntry({
    required this.id,
    required this.kind,
    required this.amountPaise,
    required this.createdAt,
    this.bookingId,
    this.reason,
  });

  factory CreditEntry.fromJson(Map<String, dynamic> json) => CreditEntry(
    id: json['id'] as String,
    kind: CreditKind.fromApi(json['kind'] as String),
    amountPaise: (json['amountPaise'] as num).toInt(),
    bookingId: json['bookingId'] as String?,
    reason: json['reason'] as String?,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  final String id;
  final CreditKind kind;
  final int amountPaise;
  final String? bookingId;
  final String? reason;
  final DateTime createdAt;
}

class ReferralRules {
  const ReferralRules({
    required this.refereeCreditPaise,
    required this.referrerCreditPaise,
    required this.maxShareOfRentPct,
    required this.maxReferrerRewards,
    required this.redeemWithinDays,
  });

  factory ReferralRules.fromJson(Map<String, dynamic> json) {
    int n(String key) => (json[key] as num).toInt();
    return ReferralRules(
      refereeCreditPaise: n('refereeCreditPaise'),
      referrerCreditPaise: n('referrerCreditPaise'),
      maxShareOfRentPct: n('maxShareOfRentPct'),
      maxReferrerRewards: n('maxReferrerRewards'),
      redeemWithinDays: n('redeemWithinDays'),
    );
  }

  final int refereeCreditPaise;
  final int referrerCreditPaise;
  final int maxShareOfRentPct;
  final int maxReferrerRewards;
  final int redeemWithinDays;
}

/// `GET /me/referral`: your code, who you invited and your credit.
class Referral {
  const Referral({
    required this.code,
    required this.link,
    required this.invited,
    required this.rewarded,
    required this.creditBalancePaise,
    required this.canRedeem,
    required this.entries,
    required this.rules,
    this.redeemBefore,
    this.referredBy,
  });

  factory Referral.fromJson(Map<String, dynamic> json) => Referral(
    code: json['code'] as String,
    link: json['link'] as String,
    invited: (json['invited'] as num).toInt(),
    rewarded: (json['rewarded'] as num).toInt(),
    creditBalancePaise: (json['creditBalancePaise'] as num).toInt(),
    canRedeem: json['canRedeem'] as bool,
    redeemBefore: _dateOrNull(json['redeemBefore']),
    referredBy: json['referredBy'] == null
        ? null
        : ChatParticipant.fromJson(json['referredBy'] as Map<String, dynamic>),
    entries: [
      for (final e in json['entries'] as List)
        CreditEntry.fromJson(e as Map<String, dynamic>),
    ],
    rules: ReferralRules.fromJson(json['rules'] as Map<String, dynamic>),
  );

  final String code;
  final String link;
  final int invited;
  final int rewarded;
  final int creditBalancePaise;

  /// A new member can still enter a friend's code.
  final bool canRedeem;
  final DateTime? redeemBefore;
  final ChatParticipant? referredBy;

  /// Newest first.
  final List<CreditEntry> entries;
  final ReferralRules rules;
}

/// Invite codes and credit. Throws [ApiException].
class ReferralsRepository {
  ReferralsRepository(this._dio);

  final Dio _dio;

  Future<Referral> get() =>
      _call(() => _dio.get<Map<String, dynamic>>('/me/referral'));

  /// Case and spaces don't matter.
  Future<Referral> redeem(String code) => _call(
    () => _dio.post<Map<String, dynamic>>(
      '/me/referral/redeem',
      data: {'code': code},
    ),
  );

  Future<Referral> _call(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async {
    try {
      return Referral.fromJson((await request()).data!);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final referralsRepositoryProvider = Provider<ReferralsRepository>(
  (ref) => ReferralsRepository(ref.watch(dioProvider)),
);
