import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { AppException } from '../../common/errors/app.exception.js';
import { AccessTokenService } from '../auth/access-token.service.js';
import { RealtimeService, userRoom } from '../realtime/realtime.service.js';
import { ConversationsService } from './conversations.service.js';
import { ChatEvent, otherParty } from './messages.service.js';

/** Minimum gap between relayed typing events per socket and conversation. */
const TYPING_THROTTLE_MS = 2000;

interface SocketData {
  userId: string;
  expiryTimer?: NodeJS.Timeout;
  /** Conversations this socket may send typing events to. */
  allowed: Set<string>;
  lastTyping: Map<string, number>;
}

/**
 * `/ws`: live chat updates. Connect with `auth: { token: <access token> }`.
 * Messages are sent over REST (stored first); this socket pushes events out
 * (`message:new`, `message:read`, `offer:updated`, `typing`) and relays typing.
 * The connection is closed when the access token expires, so the app
 * reconnects with a fresh one. A refused handshake fails with the API error
 * code as the message (e.g. `TOKEN_EXPIRED`).
 */
@WebSocketGateway({ namespace: '/ws' })
export class ChatGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly accessTokens: AccessTokenService,
    private readonly realtime: RealtimeService,
    private readonly conversations: ConversationsService,
  ) {}

  afterInit(server: Namespace): void {
    this.realtime.attach(server);
    server.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
      if (typeof token !== 'string' || !token) {
        next(handshakeError('TOKEN_INVALID', 'Missing access token'));
        return;
      }
      this.accessTokens
        .authenticate(token)
        .then(({ userId, expiresAt }) => {
          const data: SocketData = { userId, allowed: new Set(), lastTyping: new Map() };
          const ms = expiresAt.getTime() - Date.now();
          data.expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(ms, 0));
          socket.data = data;
          void socket.join(userRoom(userId));
          next();
        })
        .catch((err: unknown) => {
          const code = err instanceof AppException ? err.code : 'TOKEN_INVALID';
          next(handshakeError(code, err instanceof Error ? err.message : 'Unauthorised'));
        });
    });
  }

  handleDisconnect(socket: Socket): void {
    const data = socket.data as SocketData | undefined;
    if (data?.expiryTimer) clearTimeout(data.expiryTimer);
  }

  /** `typing { conversationId }`: shown to the other person for a few seconds. */
  @SubscribeMessage('typing')
  async typing(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId?: unknown } | undefined,
  ): Promise<void> {
    const data = socket.data as SocketData;
    const conversationId = body?.conversationId;
    if (typeof conversationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(conversationId)) return;
    const now = Date.now();
    if (now - (data.lastTyping.get(conversationId) ?? 0) < TYPING_THROTTLE_MS) return;
    data.lastTyping.set(conversationId, now);
    try {
      const c = await this.conversations.participants(conversationId, data.userId);
      data.allowed.add(conversationId);
      this.realtime.toUser(otherParty(c, data.userId), ChatEvent.TYPING, {
        conversationId,
        userId: data.userId,
      });
    } catch {
      this.logger.debug(`typing ignored for ${conversationId}`);
    }
  }
}

function handshakeError(code: string, message: string): Error & { data: unknown } {
  return Object.assign(new Error(code), { data: { code, message } });
}
