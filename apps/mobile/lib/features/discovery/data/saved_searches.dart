import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_exception.dart';
import '../../listings/data/models.dart';
import '../application/search_area.dart';
import 'models.dart';

/// What a saved search looks for. Dates and sort aren't saved: alerts are
/// about new listings, whenever they're free.
class SavedSearchFilters {
  const SavedSearchFilters({
    required this.lat,
    required this.lng,
    this.radiusKm = SearchArea.defaultRadiusKm,
    this.query,
    this.categoryId,
    this.minPricePaise,
    this.maxPricePaise,
    this.conditions = const {},
    this.verifiedOnly = false,
  });

  /// The search on screen, in [area].
  factory SavedSearchFilters.from(SearchFilters f, SearchArea area) =>
      SavedSearchFilters(
        lat: area.lat,
        lng: area.lng,
        radiusKm: area.radiusKm,
        query: f.query.trim().isEmpty ? null : f.query.trim(),
        categoryId: f.categoryId,
        minPricePaise: f.minPricePaise,
        maxPricePaise: f.maxPricePaise,
        conditions: f.conditions,
        verifiedOnly: f.verifiedOnly,
      );

  factory SavedSearchFilters.fromJson(Map<String, dynamic> json) =>
      SavedSearchFilters(
        lat: (json['lat'] as num).toDouble(),
        lng: (json['lng'] as num).toDouble(),
        radiusKm:
            (json['radiusKm'] as num?)?.toInt() ?? SearchArea.defaultRadiusKm,
        query: json['q'] as String?,
        categoryId: json['categoryId'] as String?,
        minPricePaise: (json['minPricePaise'] as num?)?.toInt(),
        maxPricePaise: (json['maxPricePaise'] as num?)?.toInt(),
        conditions: {
          for (final c in json['condition'] as List? ?? const [])
            ItemCondition.fromApi(c as String),
        },
        verifiedOnly: json['verifiedLendersOnly'] as bool? ?? false,
      );

  final double lat;
  final double lng;
  final int radiusKm;
  final String? query;
  final String? categoryId;
  final int? minPricePaise;
  final int? maxPricePaise;
  final Set<ItemCondition> conditions;
  final bool verifiedOnly;

  Map<String, dynamic> toJson() => {
    'q': ?query,
    'lat': lat,
    'lng': lng,
    'radiusKm': radiusKm,
    'categoryId': ?categoryId,
    'minPricePaise': ?minPricePaise,
    'maxPricePaise': ?maxPricePaise,
    if (conditions.isNotEmpty)
      'condition': [for (final c in conditions) c.apiValue],
    if (verifiedOnly) 'verifiedLendersOnly': true,
  };

  /// "Trekking & outdoor gear · within 5 km · ₹100–₹500/day · Verified lenders".
  String summary({String? categoryName}) {
    final price = switch ((minPricePaise, maxPricePaise)) {
      (final min?, final max?) => '${formatRupees(min)}–${formatRupees(max)}',
      (final min?, null) => 'from ${formatRupees(min)}',
      (null, final max?) => 'up to ${formatRupees(max)}',
      _ => null,
    };
    return [
      ?categoryName,
      'within $radiusKm km',
      if (price != null) '$price/day',
      if (conditions.isNotEmpty) conditions.map((c) => c.label).join(', '),
      if (verifiedOnly) 'Verified lenders',
    ].join(' · ');
  }
}

class SavedSearch {
  const SavedSearch({
    required this.id,
    required this.name,
    required this.filters,
    required this.alertsEnabled,
    required this.createdAt,
  });

  factory SavedSearch.fromJson(Map<String, dynamic> json) => SavedSearch(
    id: json['id'] as String,
    name: json['name'] as String,
    filters: SavedSearchFilters.fromJson(
      json['filters'] as Map<String, dynamic>,
    ),
    alertsEnabled: json['alertsEnabled'] as bool,
    createdAt: DateTime.parse(json['createdAt'] as String),
  );

  final String id;
  final String name;
  final SavedSearchFilters filters;
  final bool alertsEnabled;
  final DateTime createdAt;

  SavedSearch copyWith({String? name, bool? alertsEnabled}) => SavedSearch(
    id: id,
    name: name ?? this.name,
    filters: filters,
    alertsEnabled: alertsEnabled ?? this.alertsEnabled,
    createdAt: createdAt,
  );
}

/// The user's saved searches (up to 10) and their results. Throws [ApiException].
class SavedSearchesRepository {
  SavedSearchesRepository(this._dio);

  final Dio _dio;

  Future<List<SavedSearch>> list() async => [
    for (final s in await _call(
      () => _dio.get<List<dynamic>>('/me/saved-searches'),
    ))
      SavedSearch.fromJson(s as Map<String, dynamic>),
  ];

  /// The API names it (e.g. “tent” within 5 km) when [name] is null.
  Future<SavedSearch> create(
    SavedSearchFilters filters, {
    String? name,
    bool alertsEnabled = true,
  }) => _search(
    () => _dio.post<Map<String, dynamic>>(
      '/me/saved-searches',
      data: {
        'name': ?name,
        'filters': filters.toJson(),
        'alertsEnabled': alertsEnabled,
      },
    ),
  );

  Future<SavedSearch> update(String id, {String? name, bool? alertsEnabled}) =>
      _search(
        () => _dio.patch<Map<String, dynamic>>(
          '/me/saved-searches/$id',
          data: {'name': ?name, 'alertsEnabled': ?alertsEnabled},
        ),
      );

  Future<void> delete(String id) =>
      _call(() => _dio.delete<void>('/me/saved-searches/$id'));

  Future<SearchPage> results(String id, {String? cursor}) async =>
      SearchPage.fromJson(
        await _call(
          () => _dio.get<Map<String, dynamic>>(
            '/me/saved-searches/$id/results',
            queryParameters: {'cursor': ?cursor},
          ),
        ),
      );

  Future<SavedSearch> _search(
    Future<Response<Map<String, dynamic>>> Function() request,
  ) async => SavedSearch.fromJson(await _call(request));

  Future<T> _call<T>(Future<Response<T>> Function() request) async {
    try {
      return (await request()).data as T;
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final savedSearchesRepositoryProvider = Provider<SavedSearchesRepository>(
  (ref) => SavedSearchesRepository(ref.watch(dioProvider)),
);
