import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sajha/core/network/token_manager.dart';
import 'package:sajha/core/realtime/realtime_client.dart';
import 'package:sajha/features/chat/data/models.dart';

import '../helpers/fake_api.dart';
import '../helpers/fakes.dart';

void main() {
  test('reconnects back off 1, 2, 4 … seconds, capped at 30', () {
    expect(
      [for (var i = 0; i < 8; i++) reconnectDelay(i).inSeconds],
      [1, 2, 4, 8, 16, 30, 30, 30],
    );
  });

  test('recognises a refused token (the server sends the error code)', () {
    expect(isAuthError('TOKEN_EXPIRED'), isTrue);
    expect(isAuthError({'message': 'TOKEN_INVALID', 'data': {}}), isTrue);
    expect(isAuthError('websocket error'), isFalse);
    expect(isAuthError(null), isFalse);
  });

  test('validAccessToken refreshes only when there is no token yet', () async {
    final api = FakeSajhaApi();
    final tokens = TokenManager(
      dio: Dio(BaseOptions(baseUrl: 'http://api.test/v1'))
        ..httpClientAdapter = api,
      store: InMemorySessionStorage(refreshToken: api.seedSession()),
    );
    final first = await tokens.validAccessToken();
    expect(first, isNotNull);
    expect(await tokens.validAccessToken(), first);
    expect(api.refreshCalls, 1);

    await tokens.clear();
    expect(await tokens.validAccessToken(), isNull); // signed out
  });

  test('messages and conversations parse the API shapes', () {
    final m = ChatMessage.fromJson({
      'id': 'm1',
      'conversationId': 'c1',
      'senderId': 'u2',
      'mine': false,
      'type': 'OFFER',
      'body': null,
      'masked': false,
      'imageUrl': null,
      'thumbUrl': null,
      'offer': {
        'id': 'o1',
        'conversationId': 'c1',
        'proposedById': 'u2',
        'mine': false,
        'startDate': '2026-10-12',
        'endDate': '2026-10-15',
        'days': 4,
        'pricePerDayPaise': 12000,
        'rentPaise': 48000,
        'depositPaise': 100000,
        'totalPaise': 148000,
        'status': 'PENDING',
        'parentOfferId': null,
        'expiresAt': '2026-10-01T10:00:00.000Z',
        'createdAt': '2026-09-29T10:00:00.000Z',
      },
      'clientId': null,
      'readAt': null,
      'createdAt': '2026-09-29T10:00:00.000Z',
    });
    expect(m.type, MessageType.offer);
    expect(m.offer!.answerable, isTrue);
    expect(m.offer!.startDate, DateTime(2026, 10, 12));
    expect(OfferStatus.fromApi('SUPERSEDED'), OfferStatus.superseded);
    expect(
      const ChatParticipant(id: 'x', idVerified: false).displayName,
      'Nivra user',
    );
    expect(
      const ChatParticipant(
        id: 'x',
        idVerified: true,
        name: 'Asha Patil',
      ).firstName,
      'Asha',
    );
  });
}
