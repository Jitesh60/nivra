/// Chat, offers and safety, as the API returns them (see `/v1/conversations`).
/// Money is in paise.
library;

import 'dart:typed_data';

DateTime _date(Object? v) => DateTime.parse(v as String);
DateTime? _dateOrNull(Object? v) =>
    v == null ? null : DateTime.parse(v as String);

/// A person as others see them in chat.
class ChatParticipant {
  const ChatParticipant({
    required this.id,
    required this.idVerified,
    this.name,
    this.avatarUrl,
  });

  factory ChatParticipant.fromJson(Map<String, dynamic> json) =>
      ChatParticipant(
        id: json['id'] as String,
        name: json['name'] as String?,
        avatarUrl: json['avatarUrl'] as String?,
        idVerified: json['idVerified'] as bool,
      );

  final String id;
  final String? name;
  final String? avatarUrl;
  final bool idVerified;

  String get displayName =>
      (name == null || name!.trim().isEmpty) ? 'Nivra user' : name!;
  String get firstName => displayName.split(' ').first;
}

class ChatListing {
  const ChatListing({
    required this.id,
    required this.title,
    required this.status,
    required this.pricePerDayPaise,
    required this.depositPaise,
    required this.minDays,
    required this.maxDays,
    this.thumbUrl,
  });

  factory ChatListing.fromJson(Map<String, dynamic> json) => ChatListing(
    id: json['id'] as String,
    title: json['title'] as String,
    thumbUrl: json['thumbUrl'] as String?,
    status: json['status'] as String,
    pricePerDayPaise: (json['pricePerDayPaise'] as num).toInt(),
    depositPaise: (json['depositPaise'] as num).toInt(),
    minDays: (json['minDays'] as num).toInt(),
    maxDays: (json['maxDays'] as num).toInt(),
  );

  final String id;
  final String title;
  final String? thumbUrl;
  final String status;
  final int pricePerDayPaise;
  final int depositPaise;
  final int minDays;
  final int maxDays;

  bool get live => status == 'LIVE';
}

enum OfferStatus {
  pending('PENDING'),
  accepted('ACCEPTED'),
  countered('COUNTERED'),
  declined('DECLINED'),
  expired('EXPIRED'),
  superseded('SUPERSEDED');

  const OfferStatus(this.apiValue);
  final String apiValue;

  static OfferStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => expired);
}

class Offer {
  const Offer({
    required this.id,
    required this.conversationId,
    required this.proposedById,
    required this.mine,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.pricePerDayPaise,
    required this.rentPaise,
    required this.depositPaise,
    required this.totalPaise,
    required this.status,
    required this.expiresAt,
    this.parentOfferId,
  });

  factory Offer.fromJson(Map<String, dynamic> json) => Offer(
    id: json['id'] as String,
    conversationId: json['conversationId'] as String,
    proposedById: json['proposedById'] as String,
    mine: json['mine'] as bool,
    startDate: _date(json['startDate']),
    endDate: _date(json['endDate']),
    days: (json['days'] as num).toInt(),
    pricePerDayPaise: (json['pricePerDayPaise'] as num).toInt(),
    rentPaise: (json['rentPaise'] as num).toInt(),
    depositPaise: (json['depositPaise'] as num).toInt(),
    totalPaise: (json['totalPaise'] as num).toInt(),
    status: OfferStatus.fromApi(json['status'] as String),
    parentOfferId: json['parentOfferId'] as String?,
    expiresAt: _date(json['expiresAt']),
  );

  final String id;
  final String conversationId;
  final String proposedById;

  /// Proposed by the signed-in user.
  final bool mine;
  final DateTime startDate;
  final DateTime endDate;
  final int days;
  final int pricePerDayPaise;
  final int rentPaise;
  final int depositPaise;
  final int totalPaise;
  final OfferStatus status;
  final String? parentOfferId;
  final DateTime expiresAt;

  /// The other person's open offer: the user can accept, counter or decline.
  bool get answerable => !mine && status == OfferStatus.pending;
}

enum MessageType { text, image, offer, system }

/// Where an outgoing message is (incoming ones are always [sent]).
enum SendState { sent, sending, failed }

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.mine,
    required this.type,
    required this.masked,
    required this.createdAt,
    this.body,
    this.imageUrl,
    this.thumbUrl,
    this.offer,
    this.clientId,
    this.readAt,
    this.sendState = SendState.sent,
    this.localImage,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    id: json['id'] as String,
    conversationId: json['conversationId'] as String,
    senderId: json['senderId'] as String,
    mine: json['mine'] as bool,
    type: MessageType.values.byName((json['type'] as String).toLowerCase()),
    body: json['body'] as String?,
    masked: json['masked'] as bool,
    imageUrl: json['imageUrl'] as String?,
    thumbUrl: json['thumbUrl'] as String?,
    offer: json['offer'] == null
        ? null
        : Offer.fromJson(json['offer'] as Map<String, dynamic>),
    clientId: json['clientId'] as String?,
    readAt: _dateOrNull(json['readAt']),
    createdAt: _date(json['createdAt']),
  );

  final String id;
  final String conversationId;
  final String senderId;
  final bool mine;
  final MessageType type;

  /// What the viewer may see: their own text, or the other person's text with
  /// contact details replaced by •••.
  final String? body;

  /// Contact details in it are hidden from the other person.
  final bool masked;
  final String? imageUrl;
  final String? thumbUrl;
  final Offer? offer;
  final String? clientId;
  final DateTime? readAt;
  final DateTime createdAt;
  final SendState sendState;

  /// A photo still uploading (bytes shown until the server copy exists).
  final Uint8List? localImage;

  ChatMessage copyWith({
    DateTime? readAt,
    Offer? offer,
    SendState? sendState,
  }) => ChatMessage(
    id: id,
    conversationId: conversationId,
    senderId: senderId,
    mine: mine,
    type: type,
    body: body,
    masked: masked,
    imageUrl: imageUrl,
    thumbUrl: thumbUrl,
    offer: offer ?? this.offer,
    clientId: clientId,
    readAt: readAt ?? this.readAt,
    createdAt: createdAt,
    sendState: sendState ?? this.sendState,
    localImage: localImage,
  );
}

class Conversation {
  const Conversation({
    required this.id,
    required this.listing,
    required this.isBorrower,
    required this.other,
    required this.lastMessageAt,
    required this.unreadCount,
    required this.blockedByMe,
    required this.canMessage,
    this.lastMessagePreview,
    this.pendingOffer,
    this.acceptedOffer,
    this.openBookingId,
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
    id: json['id'] as String,
    listing: ChatListing.fromJson(json['listing'] as Map<String, dynamic>),
    isBorrower: json['role'] == 'BORROWER',
    other: ChatParticipant.fromJson(json['other'] as Map<String, dynamic>),
    lastMessageAt: _date(json['lastMessageAt']),
    lastMessagePreview: json['lastMessagePreview'] as String?,
    unreadCount: (json['unreadCount'] as num).toInt(),
    blockedByMe: json['blockedByMe'] as bool,
    canMessage: json['canMessage'] as bool,
    pendingOffer: json['pendingOffer'] == null
        ? null
        : Offer.fromJson(json['pendingOffer'] as Map<String, dynamic>),
    acceptedOffer: json['acceptedOffer'] == null
        ? null
        : Offer.fromJson(json['acceptedOffer'] as Map<String, dynamic>),
    openBookingId: json['openBookingId'] as String?,
  );

  final String id;
  final ChatListing listing;

  /// The signed-in user is the borrower (else the lender).
  final bool isBorrower;
  final ChatParticipant other;
  final DateTime lastMessageAt;

  /// Masked for both sides.
  final String? lastMessagePreview;
  final int unreadCount;
  final bool blockedByMe;

  /// No block either way.
  final bool canMessage;
  final Offer? pendingOffer;
  final Offer? acceptedOffer;

  /// The booking in progress for this chat, if any.
  final String? openBookingId;
}

class Page<T> {
  const Page(this.items, this.nextCursor);
  final List<T> items;
  final String? nextCursor;
}

enum ReportReason {
  spam('SPAM', 'Spam'),
  scam('SCAM', 'Scam or fraud'),
  offPlatformPayment(
    'OFF_PLATFORM_PAYMENT',
    'Asked to pay or talk outside Nivra',
  ),
  inappropriate('INAPPROPRIATE', 'Rude or inappropriate'),
  other('OTHER', 'Something else');

  const ReportReason(this.apiValue, this.label);
  final String apiValue;
  final String label;
}

enum ReportTarget {
  user('USER'),
  listing('LISTING'),
  message('MESSAGE');

  const ReportTarget(this.apiValue);
  final String apiValue;
}
