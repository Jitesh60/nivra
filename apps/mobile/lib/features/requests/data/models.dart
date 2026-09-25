/// The requests board: borrowers ask for something, nearby lenders offer
/// one of their listings. Money is in paise.
library;

import '../../chat/data/models.dart' show ChatParticipant;
import '../../discovery/data/models.dart' show ListingCard;
import '../../listings/data/models.dart';

DateTime? _dateOrNull(Object? v) =>
    v == null ? null : DateTime.parse(v as String);

enum RequestStatus {
  open('OPEN', 'Open'),
  closed('CLOSED', 'Closed'),
  expired('EXPIRED', 'Expired'),
  removed('REMOVED', 'Removed');

  const RequestStatus(this.apiValue, this.label);
  final String apiValue;
  final String label;

  static RequestStatus fromApi(String v) =>
      values.firstWhere((s) => s.apiValue == v, orElse: () => closed);
}

/// A request as the board lists it.
class ItemRequest {
  const ItemRequest({
    required this.id,
    required this.title,
    required this.details,
    required this.areaLabel,
    required this.borrower,
    required this.status,
    required this.responseCount,
    required this.answeredByMe,
    required this.mine,
    required this.expiresAt,
    required this.createdAt,
    this.category,
    this.startDate,
    this.endDate,
    this.budgetPerDayPaise,
    this.distanceKm,
  });

  factory ItemRequest.fromJson(Map<String, dynamic> json) => ItemRequest(
    id: json['id'] as String,
    title: json['title'] as String,
    details: json['details'] as String,
    category: json['category'] == null
        ? null
        : Category.fromJson(json['category'] as Map<String, dynamic>),
    startDate: _dateOrNull(json['startDate']),
    endDate: _dateOrNull(json['endDate']),
    budgetPerDayPaise: (json['budgetPerDayPaise'] as num?)?.toInt(),
    areaLabel: json['areaLabel'] as String,
    distanceKm: (json['distanceKm'] as num?)?.toDouble(),
    borrower: ChatParticipant.fromJson(
      json['borrower'] as Map<String, dynamic>,
    ),
    status: RequestStatus.fromApi(json['status'] as String),
    responseCount: (json['responseCount'] as num).toInt(),
    answeredByMe: json['answeredByMe'] as bool,
    mine: json['mine'] as bool,
    expiresAt: DateTime.parse(json['expiresAt'] as String),
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  final String id;
  final String title;
  final String details;
  final Category? category;
  final DateTime? startDate;
  final DateTime? endDate;
  final int? budgetPerDayPaise;
  final String areaLabel;

  /// Rounded to 0.5 km by the API; null for your own.
  final double? distanceKm;
  final ChatParticipant borrower;
  final RequestStatus status;
  final int responseCount;
  final bool answeredByMe;
  final bool mine;
  final DateTime expiresAt;
  final DateTime createdAt;

  BlockedRange? get dates => startDate == null || endDate == null
      ? null
      : BlockedRange(startDate!, endDate!);

  /// "Kothrud, Pune · 2.5 km".
  String get placeLine => [
    areaLabel,
    if (distanceKm != null) formatDistance(distanceKm!),
  ].join(' · ');
}

/// A lender's answer: one of their listings, and the chat it started.
class RequestResponse {
  const RequestResponse({
    required this.id,
    required this.lender,
    required this.conversationId,
    required this.message,
    required this.createdAt,
    this.listing,
  });

  factory RequestResponse.fromJson(Map<String, dynamic> json) =>
      RequestResponse(
        id: json['id'] as String,
        lender: ChatParticipant.fromJson(
          json['lender'] as Map<String, dynamic>,
        ),
        listing: json['listing'] == null
            ? null
            : ListingCard.fromJson(json['listing'] as Map<String, dynamic>),
        conversationId: json['conversationId'] as String,
        message: json['message'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  final String id;
  final ChatParticipant lender;

  /// Null once the listing is gone.
  final ListingCard? listing;
  final String conversationId;
  final String message;
  final DateTime createdAt;
}

/// A request with its answers: all of them on your own request, only yours
/// on someone else's.
class ItemRequestDetail {
  const ItemRequestDetail({required this.request, required this.responses});

  factory ItemRequestDetail.fromJson(Map<String, dynamic> json) =>
      ItemRequestDetail(
        request: ItemRequest.fromJson(json),
        responses: [
          for (final r in json['responses'] as List? ?? const [])
            RequestResponse.fromJson(r as Map<String, dynamic>),
        ],
      );

  final ItemRequest request;
  final List<RequestResponse> responses;
}

class RequestPage {
  const RequestPage(this.items, this.nextCursor);

  factory RequestPage.fromJson(Map<String, dynamic> json) => RequestPage([
    for (final r in json['items'] as List)
      ItemRequest.fromJson(r as Map<String, dynamic>),
  ], json['nextCursor'] as String?);

  final List<ItemRequest> items;
  final String? nextCursor;
}

/// What a new request says.
class NewRequest {
  const NewRequest({
    required this.title,
    required this.details,
    required this.lat,
    required this.lng,
    required this.areaLabel,
    this.categoryId,
    this.dates,
    this.budgetPerDayPaise,
  });

  final String title;
  final String details;
  final String? categoryId;
  final BlockedRange? dates;
  final int? budgetPerDayPaise;
  final double lat;
  final double lng;
  final String areaLabel;

  Map<String, dynamic> toJson() => {
    'title': title,
    'details': details,
    'categoryId': ?categoryId,
    if (dates != null) ...{
      'startDate': isoDate(dates!.start),
      'endDate': isoDate(dates!.end),
    },
    'budgetPerDayPaise': ?budgetPerDayPaise,
    'lat': lat,
    'lng': lng,
    'areaLabel': areaLabel,
  };
}
