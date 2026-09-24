import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../config/providers.dart';
import '../network/api_client.dart';
import '../network/token_manager.dart';

/// Server → app events on `/ws`.
abstract final class RealtimeEvents {
  static const messageNew = 'message:new';
  static const messageRead = 'message:read';
  static const offerUpdated = 'offer:updated';
  static const typing = 'typing';
  static const bookingUpdated = 'booking:updated';
  static const notificationNew = 'notification:new';
  static const all = [
    messageNew,
    messageRead,
    offerUpdated,
    typing,
    bookingUpdated,
    notificationNew,
  ];
}

class RealtimeEvent {
  const RealtimeEvent(this.name, this.data);
  final String name;
  final Map<String, dynamic> data;

  String? get conversationId => data['conversationId'] as String?;
}

/// Live chat, booking and notification updates. The app only listens; messages are sent over REST.
/// Faked in tests.
abstract interface class RealtimeClient {
  Stream<RealtimeEvent> get events;

  /// True while connected (a "reconnecting…" hint can use it).
  ValueListenable<bool> get connected;

  void connect();
  void disconnect();
  void typing(String conversationId);
}

/// Backoff between reconnect attempts: 1 s, 2 s, 4 s … capped at 30 s.
Duration reconnectDelay(int attempt) => Duration(
  seconds: [1 << attempt.clamp(0, 5), 30].reduce((a, b) => a < b ? a : b),
);

/// The server refuses a handshake with the API error code as the message.
bool isAuthError(Object? error) {
  final text = error is Map ? '${error['message']}' : '$error';
  return text.contains('TOKEN_EXPIRED') || text.contains('TOKEN_INVALID');
}

/// Socket.IO over WebSocket, authenticated with the access token. When the
/// server refuses the token (or closes the socket as it expires), it refreshes
/// the token and reconnects; network drops reconnect with backoff.
class SocketRealtimeClient implements RealtimeClient {
  SocketRealtimeClient({required this._url, required this._tokens});

  final String _url;
  final TokenManager _tokens;
  final _events = StreamController<RealtimeEvent>.broadcast();
  final _connected = ValueNotifier(false);
  io.Socket? _socket;
  bool _wanted = false;
  int _attempt = 0;
  Timer? _retry;

  @override
  Stream<RealtimeEvent> get events => _events.stream;

  @override
  ValueListenable<bool> get connected => _connected;

  @override
  void connect() {
    if (_wanted) return;
    _wanted = true;
    _attempt = 0;
    unawaited(_open());
  }

  @override
  void disconnect() {
    _wanted = false;
    _retry?.cancel();
    _socket?.dispose();
    _socket = null;
    _connected.value = false;
  }

  @override
  void typing(String conversationId) =>
      _socket?.emit(RealtimeEvents.typing, {'conversationId': conversationId});

  Future<void> _open({bool refreshed = false}) async {
    if (!_wanted) return;
    String? token;
    try {
      token = refreshed
          ? await _tokens.refresh()
          : await _tokens.validAccessToken();
    } catch (_) {
      return _scheduleRetry(); // Offline: try again later.
    }
    if (token == null || !_wanted) return; // Signed out.

    _socket?.dispose();
    final socket = io.io(
      _url,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .disableReconnection()
          .enableForceNew()
          .setAuth({'token': token})
          .build(),
    );
    _socket = socket;
    socket
      ..onConnect((_) {
        _attempt = 0;
        _connected.value = true;
      })
      ..onConnectError((error) {
        _connected.value = false;
        if (isAuthError(error) && !refreshed) {
          unawaited(_open(refreshed: true));
        } else {
          _scheduleRetry();
        }
      })
      ..onDisconnect((_) {
        _connected.value = false;
        // The server closes the socket when the token expires: reconnect
        // with a fresh one.
        if (_wanted && identical(_socket, socket)) {
          unawaited(_open(refreshed: true));
        }
      });
    for (final name in RealtimeEvents.all) {
      socket.on(name, (data) {
        if (data is Map) {
          _events.add(RealtimeEvent(name, Map<String, dynamic>.from(data)));
        }
      });
    }
    socket.connect();
  }

  void _scheduleRetry() {
    if (!_wanted) return;
    _retry?.cancel();
    _retry = Timer(reconnectDelay(_attempt++), () => unawaited(_open()));
  }
}

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final client = SocketRealtimeClient(
    url: ref.watch(appConfigProvider).socketUrl,
    tokens: ref.watch(tokenManagerProvider),
  );
  ref.onDispose(client.disconnect);
  return client;
});
