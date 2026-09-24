/// Payouts and earnings, as the API returns them (`/v1/me/payout-account`,
/// `/v1/me/earnings`). Money is in paise.
library;

DateTime _date(Object? v) => DateTime.parse(v as String);

enum PayoutAccountStatus {
  pending('PENDING', 'Being verified'),
  needsClarification('NEEDS_CLARIFICATION', 'Needs attention'),
  activated('ACTIVATED', 'Active'),
  rejected('REJECTED', 'Not accepted');

  const PayoutAccountStatus(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static PayoutAccountStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => pending);
}

/// The lender's bank account for payouts (Razorpay Route). Only the last 4
/// digits of the account number and PAN are ever shown.
class PayoutAccount {
  const PayoutAccount({
    required this.status,
    required this.beneficiaryName,
    required this.bankLast4,
    required this.ifsc,
    required this.panLast4,
    this.statusReason,
  });

  factory PayoutAccount.fromJson(Map<String, dynamic> json) => PayoutAccount(
    status: PayoutAccountStatus.fromApi(json['status'] as String),
    statusReason: json['statusReason'] as String?,
    beneficiaryName: json['beneficiaryName'] as String,
    bankLast4: json['bankLast4'] as String,
    ifsc: json['ifsc'] as String,
    panLast4: json['panLast4'] as String,
  );

  final PayoutAccountStatus status;
  final String? statusReason;
  final String beneficiaryName;
  final String bankLast4;
  final String ifsc;
  final String panLast4;
}

/// What the payout form sends. The full account number and PAN go to
/// Razorpay through the API and aren't kept.
class PayoutAccountInput {
  const PayoutAccountInput({
    required this.beneficiaryName,
    required this.accountNumber,
    required this.ifsc,
    required this.pan,
    required this.email,
    required this.street,
    required this.city,
    required this.state,
    required this.postalCode,
  });

  final String beneficiaryName;
  final String accountNumber;
  final String ifsc;
  final String pan;
  final String email;
  final String street;
  final String city;
  final String state;
  final String postalCode;

  Map<String, dynamic> toJson() => {
    'beneficiaryName': beneficiaryName.trim(),
    'accountNumber': accountNumber.trim(),
    'ifsc': ifsc.trim().toUpperCase(),
    'pan': pan.trim().toUpperCase(),
    'email': email.trim(),
    'street': street.trim(),
    'city': city.trim(),
    'state': state.trim(),
    'postalCode': postalCode.trim(),
  };
}

enum TransferStatus {
  awaitingAccount('AWAITING_ACCOUNT', 'Waiting for your bank account'),
  onHold('ON_HOLD', 'Held until the item is back'),
  released('RELEASED', 'Paid'),
  reversed('REVERSED', 'Refunded to the borrower'),
  failed('FAILED', 'Retrying');

  const TransferStatus(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static TransferStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => onHold);
}

/// One booking's payout to the lender.
class Earning {
  const Earning({
    required this.bookingId,
    required this.listingTitle,
    required this.startDate,
    required this.endDate,
    required this.amountPaise,
    required this.status,
    required this.onHold,
    required this.createdAt,
  });

  factory Earning.fromJson(Map<String, dynamic> json) => Earning(
    bookingId: json['bookingId'] as String,
    listingTitle: json['listingTitle'] as String,
    startDate: _date(json['startDate']),
    endDate: _date(json['endDate']),
    amountPaise: (json['amountPaise'] as num).toInt(),
    status: TransferStatus.fromApi(json['status'] as String),
    onHold: json['onHold'] as bool,
    createdAt: _date(json['createdAt']),
  );

  final String bookingId;
  final String listingTitle;
  final DateTime startDate;
  final DateTime endDate;
  final int amountPaise;
  final TransferStatus status;
  final bool onHold;
  final DateTime createdAt;
}

class Earnings {
  const Earnings({
    required this.onHoldPaise,
    required this.paidPaise,
    required this.awaitingAccountPaise,
    required this.items,
    this.account,
  });

  factory Earnings.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>;
    return Earnings(
      account: json['account'] == null
          ? null
          : PayoutAccount.fromJson(json['account'] as Map<String, dynamic>),
      onHoldPaise: (totals['onHoldPaise'] as num).toInt(),
      paidPaise: (totals['paidPaise'] as num).toInt(),
      awaitingAccountPaise: (totals['awaitingAccountPaise'] as num).toInt(),
      items: [
        for (final e in json['items'] as List)
          Earning.fromJson(e as Map<String, dynamic>),
      ],
    );
  }

  final PayoutAccount? account;

  /// At Razorpay, released after the return.
  final int onHoldPaise;

  /// Sent to the bank.
  final int paidPaise;

  /// Waiting for a payout account.
  final int awaitingAccountPaise;

  /// Newest first.
  final List<Earning> items;
}
