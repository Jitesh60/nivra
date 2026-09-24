/// ID and other documents a user can keep in their vault. Mirrors the API's
/// `DocumentType`.
enum DocumentType {
  aadhaarMasked('AADHAAR_MASKED', 'Masked Aadhaar', hasBack: true),
  pan('PAN', 'PAN card'),
  drivingLicence('DRIVING_LICENCE', 'Driving licence', hasBack: true),
  passport('PASSPORT', 'Passport'),
  voterId('VOTER_ID', 'Voter ID', hasBack: true),
  collegeId('COLLEGE_ID', 'College ID'),
  employeeId('EMPLOYEE_ID', 'Employee ID'),
  addressProof('ADDRESS_PROOF', 'Address proof'),
  other('OTHER', 'Other document');

  const DocumentType(this.apiValue, this.label, {this.hasBack = false});

  final String apiValue;
  final String label;

  /// Asks for a photo of the back as well.
  final bool hasBack;

  static DocumentType fromApi(String value) => values.firstWhere(
    (t) => t.apiValue == value,
    orElse: () => DocumentType.other,
  );
}

enum DocumentStatus {
  pending,
  approved,
  rejected;

  static DocumentStatus fromApi(String value) => switch (value) {
    'APPROVED' => approved,
    'REJECTED' => rejected,
    _ => pending,
  };
}

enum DocumentSide { front, back }

class UserDocument {
  const UserDocument({
    required this.id,
    required this.type,
    required this.status,
    required this.hasBack,
    required this.createdAt,
    this.label,
    this.rejectionReason,
    this.expiresOn,
  });

  factory UserDocument.fromJson(Map<String, dynamic> json) => UserDocument(
    id: json['id'] as String,
    type: DocumentType.fromApi(json['type'] as String),
    label: json['label'] as String?,
    status: DocumentStatus.fromApi(json['status'] as String),
    rejectionReason: json['rejectionReason'] as String?,
    hasBack: json['hasBack'] as bool? ?? false,
    expiresOn: json['expiresOn'] == null
        ? null
        : DateTime.parse(json['expiresOn'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  final String id;
  final DocumentType type;

  /// Name the user gave an [DocumentType.other] document.
  final String? label;
  final DocumentStatus status;
  final String? rejectionReason;
  final bool hasBack;
  final DateTime? expiresOn;
  final DateTime createdAt;

  String get title =>
      type == DocumentType.other && label != null ? label! : type.label;

  bool isExpired([DateTime? now]) {
    if (expiresOn == null) return false;
    final today = now ?? DateTime.now();
    return expiresOn!.isBefore(DateTime(today.year, today.month, today.day));
  }

  /// Pending and approved documents block adding another of the same type.
  bool get isLive => status != DocumentStatus.rejected;
}
