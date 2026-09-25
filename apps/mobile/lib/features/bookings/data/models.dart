/// Bookings, shared documents and in-app notifications, as the API returns
/// them (see `/v1/bookings`, `/v1/me/notifications`). Money is in paise.
library;

import '../../chat/data/models.dart' show ChatParticipant;
import '../../documents/data/models.dart' show DocumentType;
import '../../listings/data/models.dart' show RequiredDocType;

DateTime _date(Object? v) => DateTime.parse(v as String);
DateTime? _dateOrNull(Object? v) =>
    v == null ? null : DateTime.parse(v as String);

enum BookingStatus {
  requested('REQUESTED', 'Requested'),
  awaitingDocs('AWAITING_DOCS', 'Waiting for documents'),
  awaitingPayment('AWAITING_PAYMENT', 'Waiting for payment'),
  confirmed('CONFIRMED', 'Confirmed'),
  active('ACTIVE', 'In progress'),
  returned('RETURNED', 'Returned'),
  completed('COMPLETED', 'Completed'),
  disputed('DISPUTED', 'Disputed'),
  declined('DECLINED', 'Declined'),
  expired('EXPIRED', 'Expired'),
  cancelled('CANCELLED', 'Cancelled');

  const BookingStatus(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static BookingStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => expired);

  /// Still in progress (not declined, expired, cancelled or completed).
  bool get open =>
      !const {declined, expired, cancelled, completed}.contains(this);
}

enum BookingRole { borrower, lender }

enum BookingScope { open, past }

class BookingListing {
  const BookingListing({
    required this.id,
    required this.title,
    this.thumbUrl,
    this.areaLabel,
  });

  factory BookingListing.fromJson(Map<String, dynamic> json) => BookingListing(
    id: json['id'] as String,
    title: json['title'] as String,
    thumbUrl: json['thumbUrl'] as String?,
    areaLabel: json['areaLabel'] as String?,
  );

  final String id;
  final String title;
  final String? thumbUrl;
  final String? areaLabel;
}

/// A booking as it appears in lists and live updates.
class Booking {
  const Booking({
    required this.id,
    required this.status,
    required this.fromOffer,
    required this.isBorrower,
    required this.listing,
    required this.other,
    required this.conversationId,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.pricePerDayPaise,
    required this.rentPaise,
    required this.feePaise,
    required this.depositPaise,
    required this.totalPaise,
    required this.createdAt,
    this.creditPaise = 0,
    this.expiresAt,
    this.declineReason,
    this.cancelledBy,
    this.cancelReason,
  });

  factory Booking.fromJson(Map<String, dynamic> json) => Booking(
    id: json['id'] as String,
    status: BookingStatus.fromApi(json['status'] as String),
    fromOffer: json['source'] == 'OFFER',
    isBorrower: json['role'] == 'BORROWER',
    listing: BookingListing.fromJson(json['listing'] as Map<String, dynamic>),
    other: ChatParticipant.fromJson(json['other'] as Map<String, dynamic>),
    conversationId: json['conversationId'] as String,
    startDate: _date(json['startDate']),
    endDate: _date(json['endDate']),
    days: (json['days'] as num).toInt(),
    pricePerDayPaise: (json['pricePerDayPaise'] as num).toInt(),
    rentPaise: (json['rentPaise'] as num).toInt(),
    feePaise: (json['feePaise'] as num).toInt(),
    depositPaise: (json['depositPaise'] as num).toInt(),
    creditPaise: (json['creditPaise'] as num?)?.toInt() ?? 0,
    totalPaise: (json['totalPaise'] as num).toInt(),
    expiresAt: _dateOrNull(json['expiresAt']),
    declineReason: json['declineReason'] as String?,
    cancelledBy: json['cancelledBy'] as String?,
    cancelReason: json['cancelReason'] as String?,
    createdAt: _date(json['createdAt']),
  );

  final String id;
  final BookingStatus status;

  /// Made from an offer agreed in chat (already accepted by both).
  final bool fromOffer;

  /// The signed-in user is the borrower (else the lender).
  final bool isBorrower;
  final BookingListing listing;
  final ChatParticipant other;
  final String conversationId;
  final DateTime startDate;
  final DateTime endDate;
  final int days;
  final int pricePerDayPaise;
  final int rentPaise;
  final int feePaise;
  final int depositPaise;

  /// Invite credit taken off the borrower's total.
  final int creditPaise;

  /// Rent + fee + deposit − credit.
  final int totalPaise;

  /// The current step times out then, and the booking expires.
  final DateTime? expiresAt;
  final String? declineReason;

  /// BORROWER, LENDER or ADMIN.
  final String? cancelledBy;
  final String? cancelReason;
  final DateTime createdAt;

  /// "#4F2A9C": the end of the id (its start is a timestamp).
  String get ref =>
      '#${id.replaceAll('-', '').substring(id.replaceAll('-', '').length - 6).toUpperCase()}';
}

/// What the viewer can do now (from the API's rules).
class BookingActions {
  const BookingActions({
    this.accept = false,
    this.decline = false,
    this.cancel = false,
    this.shareDocs = false,
    this.reviewDocs = false,
    this.pay = false,
    this.handover = false,
    this.returnItem = false,
    this.noShow = false,
    this.dispute = false,
    this.showCode = false,
    this.addPhotos = false,
    this.respond = false,
    this.review = false,
  });

  factory BookingActions.fromJson(Map<String, dynamic> json) => BookingActions(
    accept: json['accept'] as bool,
    decline: json['decline'] as bool,
    cancel: json['cancel'] as bool,
    shareDocs: json['shareDocs'] as bool,
    reviewDocs: json['reviewDocs'] as bool,
    pay: json['pay'] as bool? ?? false,
    handover: json['handover'] as bool? ?? false,
    returnItem: json['return'] as bool? ?? false,
    noShow: json['noShow'] as bool? ?? false,
    dispute: json['dispute'] as bool? ?? false,
    showCode: json['showCode'] as bool? ?? false,
    addPhotos: json['addPhotos'] as bool? ?? false,
    respond: json['respond'] as bool? ?? false,
    review: json['review'] as bool? ?? false,
  );

  final bool accept;
  final bool decline;
  final bool cancel;
  final bool shareDocs;
  final bool reviewDocs;

  /// Borrower: pay now.
  final bool pay;

  /// Lender: confirm the handover with the borrower's code.
  final bool handover;

  /// Borrower: confirm the return with the lender's code.
  final bool returnItem;

  /// Lender: the borrower didn't come for the pickup.
  final bool noShow;

  /// Lender: report a problem (claim from the deposit).
  final bool dispute;

  /// Show your code: the borrower's at handover, the lender's at return.
  final bool showCode;
  final bool addPhotos;

  /// Borrower: reply to the lender's claim.
  final bool respond;

  /// Rate the other person.
  final bool review;
}

/// A document the lender asks for, and which vault documents count.
class BookingRequiredDoc {
  const BookingRequiredDoc({
    required this.id,
    required this.type,
    required this.accepts,
    this.note,
  });

  factory BookingRequiredDoc.fromJson(Map<String, dynamic> json) =>
      BookingRequiredDoc(
        id: json['id'] as String,
        type: RequiredDocType.fromApi(json['docType'] as String),
        note: json['note'] as String?,
        accepts: [
          for (final t in json['accepts'] as List)
            DocumentType.fromApi(t as String),
        ],
      );

  final String id;
  final RequiredDocType type;
  final String? note;

  /// Empty means any type.
  final List<DocumentType> accepts;

  String get title =>
      type == RequiredDocType.other && note != null ? note! : type.label;

  bool acceptsType(DocumentType t) => accepts.isEmpty || accepts.contains(t);
}

class DocumentView {
  const DocumentView({required this.at, this.viewerName});

  factory DocumentView.fromJson(Map<String, dynamic> json) => DocumentView(
    viewerName: json['viewerName'] as String?,
    at: _date(json['at']),
  );

  final String? viewerName;
  final DateTime at;
}

enum ShareStatus {
  submitted,
  approved,
  rejected;

  static ShareStatus fromApi(String v) => switch (v) {
    'APPROVED' => approved,
    'REJECTED' => rejected,
    _ => submitted,
  };
}

/// A document shared with the lender for this booking.
class SharedDocument {
  const SharedDocument({
    required this.id,
    required this.type,
    required this.verified,
    required this.status,
    required this.hasBack,
    required this.viewable,
    required this.views,
    this.requiredDocId,
    this.label,
  });

  factory SharedDocument.fromJson(Map<String, dynamic> json) => SharedDocument(
    id: json['id'] as String,
    requiredDocId: json['requiredDocId'] as String?,
    type: DocumentType.fromApi(json['docType'] as String),
    label: json['label'] as String?,
    verified: json['verified'] as bool,
    status: ShareStatus.fromApi(json['status'] as String),
    hasBack: json['hasBack'] as bool,
    viewable: json['viewable'] as bool,
    views: [
      for (final v in json['views'] as List)
        DocumentView.fromJson(v as Map<String, dynamic>),
    ],
  );

  final String id;
  final String? requiredDocId;
  final DocumentType type;
  final String? label;

  /// Nivra had verified it when it was shared.
  final bool verified;
  final ShareStatus status;
  final bool hasBack;

  /// The lender can open it now.
  final bool viewable;

  /// Who opened it (the borrower's view only).
  final List<DocumentView> views;

  String get title =>
      type == DocumentType.other && label != null ? label! : type.label;
}

enum BookingEventType {
  requested('REQUESTED'),
  accepted('ACCEPTED'),
  declined('DECLINED'),
  expired('EXPIRED'),
  cancelled('CANCELLED'),
  docsSubmitted('DOCS_SUBMITTED'),
  docsApproved('DOCS_APPROVED'),
  docsRejected('DOCS_REJECTED'),
  paid('PAID'),
  handedOver('HANDED_OVER'),
  returned('RETURNED'),
  noShow('NO_SHOW'),
  disputed('DISPUTED'),
  completed('COMPLETED'),
  disputeResolved('DISPUTE_RESOLVED');

  const BookingEventType(this.apiValue);
  final String apiValue;

  static BookingEventType fromApi(String v) =>
      values.firstWhere((t) => t.apiValue == v, orElse: () => requested);
}

/// Who did something: BORROWER, LENDER, ADMIN (Nivra) or SYSTEM.
class BookingEvent {
  const BookingEvent({
    required this.type,
    required this.status,
    required this.by,
    required this.at,
    this.note,
  });

  factory BookingEvent.fromJson(Map<String, dynamic> json) => BookingEvent(
    type: BookingEventType.fromApi(json['type'] as String),
    status: BookingStatus.fromApi(json['status'] as String),
    by: json['by'] as String,
    note: json['note'] as String?,
    at: _date(json['at']),
  );

  final BookingEventType type;
  final BookingStatus status;
  final String by;
  final String? note;
  final DateTime at;
}

/// A booking with everything its page shows.
class BookingDetail {
  const BookingDetail({
    required this.booking,
    required this.requiredDocs,
    required this.sharedDocuments,
    required this.events,
    required this.can,
    this.payment,
    this.pickupAddress,
    this.rental,
    this.conditionReports = const [],
    this.dispute,
    this.reviews = const BookingReviews(),
  });

  factory BookingDetail.fromJson(Map<String, dynamic> json) => BookingDetail(
    booking: Booking.fromJson(json),
    requiredDocs: [
      for (final d in json['requiredDocs'] as List)
        BookingRequiredDoc.fromJson(d as Map<String, dynamic>),
    ],
    sharedDocuments: [
      for (final d in json['sharedDocuments'] as List)
        SharedDocument.fromJson(d as Map<String, dynamic>),
    ],
    events: [
      for (final e in json['events'] as List)
        BookingEvent.fromJson(e as Map<String, dynamic>),
    ],
    can: BookingActions.fromJson(json['can'] as Map<String, dynamic>),
    payment: json['payment'] == null
        ? null
        : BookingPayment.fromJson(json['payment'] as Map<String, dynamic>),
    pickupAddress: json['pickupAddress'] as String?,
    rental: json['rental'] == null
        ? null
        : RentalInfo.fromJson(json['rental'] as Map<String, dynamic>),
    conditionReports: [
      for (final r in json['conditionReports'] as List? ?? const [])
        ConditionReport.fromJson(r as Map<String, dynamic>),
    ],
    dispute: json['dispute'] == null
        ? null
        : BookingDispute.fromJson(json['dispute'] as Map<String, dynamic>),
    reviews: json['reviews'] == null
        ? const BookingReviews()
        : BookingReviews.fromJson(json['reviews'] as Map<String, dynamic>),
  );

  final Booking booking;
  final List<BookingRequiredDoc> requiredDocs;
  final List<SharedDocument> sharedDocuments;

  /// Oldest first.
  final List<BookingEvent> events;
  final BookingActions can;

  /// The borrower's payment, once one went through (or was attempted).
  final BookingPayment? payment;

  /// The exact pickup address: the borrower's, once confirmed.
  final String? pickupAddress;

  /// Handover, return and the late fee (paid bookings).
  final RentalInfo? rental;

  /// Condition photos at handover and return, per person.
  final List<ConditionReport> conditionReports;
  final BookingDispute? dispute;
  final BookingReviews reviews;
}

/// The rental: when it changed hands, when it's due, the late fee.
class RentalInfo {
  const RentalInfo({
    required this.dueAt,
    required this.lateDays,
    required this.lateFeePaise,
    required this.keptPaise,
    this.handedOverAt,
    this.returnedAt,
    this.claimUntil,
    this.completedAt,
    this.noShowAt,
  });

  factory RentalInfo.fromJson(Map<String, dynamic> json) => RentalInfo(
    handedOverAt: _dateOrNull(json['handedOverAt']),
    dueAt: _date(json['dueAt']),
    returnedAt: _dateOrNull(json['returnedAt']),
    claimUntil: _dateOrNull(json['claimUntil']),
    lateDays: (json['lateDays'] as num).toInt(),
    lateFeePaise: (json['lateFeePaise'] as num).toInt(),
    keptPaise: (json['keptPaise'] as num).toInt(),
    completedAt: _dateOrNull(json['completedAt']),
    noShowAt: _dateOrNull(json['noShowAt']),
  );

  final DateTime? handedOverAt;

  /// Due back by (midnight IST after the last day).
  final DateTime dueAt;
  final DateTime? returnedAt;

  /// The lender can report a problem until then.
  final DateTime? claimUntil;

  /// So far, while the item is still out.
  final int lateDays;
  final int lateFeePaise;

  /// Deposit the lender kept (late fee plus any dispute award).
  final int keptPaise;
  final DateTime? completedAt;
  final DateTime? noShowAt;
}

enum RentalStage {
  handover('HANDOVER', 'At handover'),
  returned('RETURN', 'At return');

  const RentalStage(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static RentalStage fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => handover);
}

class ConditionPhoto {
  const ConditionPhoto({required this.url, required this.thumbUrl});

  factory ConditionPhoto.fromJson(Map<String, dynamic> json) => ConditionPhoto(
    url: json['url'] as String,
    thumbUrl: json['thumbUrl'] as String,
  );

  /// Short-lived links (10 minutes).
  final String url;
  final String thumbUrl;
}

List<ConditionPhoto> _photos(Object? list) => [
  for (final p in list as List? ?? const [])
    ConditionPhoto.fromJson(p as Map<String, dynamic>),
];

class ConditionReport {
  const ConditionReport({
    required this.stage,
    required this.byBorrower,
    required this.photos,
    required this.at,
    this.note,
  });

  factory ConditionReport.fromJson(Map<String, dynamic> json) =>
      ConditionReport(
        stage: RentalStage.fromApi(json['stage'] as String),
        byBorrower: json['by'] == 'BORROWER',
        photos: _photos(json['photos']),
        note: json['note'] as String?,
        at: _date(json['at']),
      );

  final RentalStage stage;
  final bool byBorrower;
  final List<ConditionPhoto> photos;
  final String? note;
  final DateTime at;
}

enum DisputeReason {
  damage('DAMAGE', 'Damaged'),
  missingParts('MISSING_PARTS', 'Parts missing'),
  notReturned('NOT_RETURNED', 'Not returned'),
  other('OTHER', 'Something else');

  const DisputeReason(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static DisputeReason fromApi(String v) =>
      values.firstWhere((r) => r.apiValue == v, orElse: () => other);
}

/// The lender's claim on the deposit, the borrower's reply and Nivra's decision.
class BookingDispute {
  const BookingDispute({
    required this.reason,
    required this.description,
    required this.claimPaise,
    required this.evidence,
    required this.responsePhotos,
    required this.resolved,
    required this.createdAt,
    this.responseNote,
    this.respondedAt,
    this.keptPaise,
    this.resolutionNote,
    this.resolvedAt,
  });

  factory BookingDispute.fromJson(Map<String, dynamic> json) => BookingDispute(
    reason: DisputeReason.fromApi(json['reason'] as String),
    description: json['description'] as String,
    claimPaise: (json['claimPaise'] as num).toInt(),
    evidence: _photos(json['evidence']),
    responseNote: json['responseNote'] as String?,
    responsePhotos: _photos(json['responsePhotos']),
    respondedAt: _dateOrNull(json['respondedAt']),
    resolved: json['status'] == 'RESOLVED',
    keptPaise: (json['keptPaise'] as num?)?.toInt(),
    resolutionNote: json['resolutionNote'] as String?,
    resolvedAt: _dateOrNull(json['resolvedAt']),
    createdAt: _date(json['createdAt']),
  );

  final DisputeReason reason;
  final String description;
  final int claimPaise;
  final List<ConditionPhoto> evidence;
  final String? responseNote;
  final List<ConditionPhoto> responsePhotos;
  final DateTime? respondedAt;
  final bool resolved;

  /// What Nivra let the lender keep.
  final int? keptPaise;
  final String? resolutionNote;
  final DateTime? resolvedAt;
  final DateTime createdAt;
}

class BookingReview {
  const BookingReview({
    required this.rating,
    required this.createdAt,
    this.comment,
    this.publishedAt,
  });

  factory BookingReview.fromJson(Map<String, dynamic> json) => BookingReview(
    rating: (json['rating'] as num).toInt(),
    comment: json['comment'] as String?,
    createdAt: _date(json['createdAt']),
    publishedAt: _dateOrNull(json['publishedAt']),
  );

  final int rating;
  final String? comment;
  final DateTime createdAt;

  /// Null while hidden (until both have reviewed, or 7 days).
  final DateTime? publishedAt;
}

class BookingReviews {
  const BookingReviews({this.mine, this.theirs, this.reviewUntil});

  factory BookingReviews.fromJson(Map<String, dynamic> json) => BookingReviews(
    mine: json['mine'] == null
        ? null
        : BookingReview.fromJson(json['mine'] as Map<String, dynamic>),
    theirs: json['theirs'] == null
        ? null
        : BookingReview.fromJson(json['theirs'] as Map<String, dynamic>),
    reviewUntil: _dateOrNull(json['reviewUntil']),
  );

  final BookingReview? mine;

  /// The other person's, once published.
  final BookingReview? theirs;
  final DateTime? reviewUntil;
}

/// The code the viewer shows the other person (`GET /bookings/:id/code`).
class BookingCode {
  const BookingCode({
    required this.stage,
    required this.code,
    required this.qr,
  });

  factory BookingCode.fromJson(Map<String, dynamic> json) => BookingCode(
    stage: RentalStage.fromApi(json['stage'] as String),
    code: json['code'] as String,
    qr: json['qr'] as String,
  );

  final RentalStage stage;
  final String code;

  /// What the QR holds: `sajha://booking/<id>/<stage>/<code>`.
  final String qr;
}

/// The 6 digits out of a scanned QR (or null if it isn't one of ours).
String? codeFromQr(String raw, {required String bookingId}) {
  final m = RegExp(r'^sajha://booking/([^/]+)/(HANDOVER|RETURN)/(\d{6})$')
      .firstMatch(raw.trim());
  if (m == null || m.group(1) != bookingId) return null;
  return m.group(3);
}

/// A published review of a person or an item.
class PublicReview {
  const PublicReview({
    required this.id,
    required this.rating,
    required this.byBorrower,
    required this.listingTitle,
    required this.publishedAt,
    this.comment,
    this.authorName,
    this.authorAvatarUrl,
  });

  factory PublicReview.fromJson(Map<String, dynamic> json) => PublicReview(
    id: json['id'] as String,
    rating: (json['rating'] as num).toInt(),
    comment: json['comment'] as String?,
    byBorrower: json['authorRole'] == 'BORROWER',
    authorName: json['authorName'] as String?,
    authorAvatarUrl: json['authorAvatarUrl'] as String?,
    listingTitle: json['listingTitle'] as String,
    publishedAt: _date(json['publishedAt']),
  );

  final String id;
  final int rating;
  final String? comment;
  final bool byBorrower;
  final String? authorName;
  final String? authorAvatarUrl;
  final String listingTitle;
  final DateTime publishedAt;
}

class ReviewPage {
  const ReviewPage({
    required this.items,
    required this.ratingCount,
    this.ratingAvg,
    this.nextCursor,
  });

  factory ReviewPage.fromJson(Map<String, dynamic> json) => ReviewPage(
    ratingAvg: (json['ratingAvg'] as num?)?.toDouble(),
    ratingCount: (json['ratingCount'] as num).toInt(),
    items: [
      for (final r in json['items'] as List)
        PublicReview.fromJson(r as Map<String, dynamic>),
    ],
    nextCursor: json['nextCursor'] as String?,
  );

  final double? ratingAvg;
  final int ratingCount;
  final List<PublicReview> items;
  final String? nextCursor;
}

enum PaymentStatus {
  created('CREATED'),
  captured('CAPTURED'),
  failed('FAILED'),
  partiallyRefunded('PARTIALLY_REFUNDED'),
  refunded('REFUNDED');

  const PaymentStatus(this.apiValue);
  final String apiValue;

  static PaymentStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => created);

  /// Money was taken (some may have come back since).
  bool get paid =>
      this == captured || this == partiallyRefunded || this == refunded;
}

enum RefundKind {
  cancellation('CANCELLATION'),
  latePayment('LATE_PAYMENT'),
  manual('MANUAL'),
  depositReturn('DEPOSIT_RETURN');

  const RefundKind(this.apiValue);
  final String apiValue;

  static RefundKind fromApi(String v) =>
      values.firstWhere((k) => k.apiValue == v, orElse: () => manual);
}

enum RefundStatus {
  pending('PENDING', 'On the way'),
  processed('PROCESSED', 'Refunded'),
  failed('FAILED', 'Retrying');

  const RefundStatus(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static RefundStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => pending);
}

class BookingRefund {
  const BookingRefund({
    required this.amountPaise,
    required this.kind,
    required this.status,
    required this.createdAt,
  });

  factory BookingRefund.fromJson(Map<String, dynamic> json) => BookingRefund(
    amountPaise: (json['amountPaise'] as num).toInt(),
    kind: RefundKind.fromApi(json['kind'] as String),
    status: RefundStatus.fromApi(json['status'] as String),
    createdAt: _date(json['createdAt']),
  );

  final int amountPaise;
  final RefundKind kind;
  final RefundStatus status;
  final DateTime createdAt;
}

class BookingPayment {
  const BookingPayment({
    required this.status,
    required this.amountPaise,
    required this.refundedPaise,
    required this.refunds,
    this.method,
    this.paidAt,
  });

  factory BookingPayment.fromJson(Map<String, dynamic> json) => BookingPayment(
    status: PaymentStatus.fromApi(json['status'] as String),
    amountPaise: (json['amountPaise'] as num).toInt(),
    method: json['method'] as String?,
    paidAt: _dateOrNull(json['paidAt']),
    refundedPaise: (json['refundedPaise'] as num).toInt(),
    refunds: [
      for (final r in json['refunds'] as List)
        BookingRefund.fromJson(r as Map<String, dynamic>),
    ],
  );

  final PaymentStatus status;
  final int amountPaise;

  /// card, upi, netbanking… (Razorpay's name).
  final String? method;
  final DateTime? paidAt;
  final int refundedPaise;
  final List<BookingRefund> refunds;
}

/// What cancelling now would refund (`GET /bookings/:id/cancel-preview`).
class CancelPreview {
  const CancelPreview({
    required this.refundPaise,
    required this.rentPaise,
    required this.feePaise,
    required this.depositPaise,
    required this.summary,
    this.creditBackPaise = 0,
    this.tier,
  });

  factory CancelPreview.fromJson(Map<String, dynamic> json) => CancelPreview(
    refundPaise: (json['refundPaise'] as num).toInt(),
    rentPaise: (json['rentPaise'] as num).toInt(),
    feePaise: (json['feePaise'] as num).toInt(),
    depositPaise: (json['depositPaise'] as num).toInt(),
    creditBackPaise: (json['creditBackPaise'] as num?)?.toInt() ?? 0,
    tier: json['tier'] as String?,
    summary: json['summary'] as String,
  );

  final int refundPaise;
  final int rentPaise;
  final int feePaise;
  final int depositPaise;

  /// Invite credit that goes back to the borrower's balance.
  final int creditBackPaise;

  /// FULL, HALF_RENT or DEPOSIT_ONLY; null when nothing was paid.
  final String? tier;

  /// One line to show before confirming.
  final String summary;
}

/// A short-lived link to a shared document, and the watermark to draw over it.
class DocumentLink {
  const DocumentLink({
    required this.url,
    required this.expiresAt,
    required this.watermark,
  });

  factory DocumentLink.fromJson(Map<String, dynamic> json) => DocumentLink(
    url: json['url'] as String,
    expiresAt: _date(json['expiresAt']),
    watermark: json['watermark'] as String,
  );

  final String url;
  final DateTime expiresAt;
  final String watermark;
}

/// One entry in the bell.
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.bookingId,
    this.listingId,
    this.requestId,
    this.readAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) =>
      AppNotification(
        id: json['id'] as String,
        type: json['type'] as String,
        title: json['title'] as String,
        body: json['body'] as String,
        bookingId: json['bookingId'] as String?,
        listingId: json['listingId'] as String?,
        requestId: json['requestId'] as String?,
        readAt: _dateOrNull(json['readAt']),
        createdAt: _date(json['createdAt']),
      );

  final String id;
  final String type;
  final String title;
  final String body;
  final String? bookingId;

  /// A new listing for a saved search (`search.alert`).
  final String? listingId;

  /// `request.*` notifications.
  final String? requestId;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get unread => readAt == null;
}

class NotificationPage {
  const NotificationPage(this.items, this.nextCursor, this.unread);
  final List<AppNotification> items;
  final String? nextCursor;
  final int unread;
}
