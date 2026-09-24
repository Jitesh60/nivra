import { Injectable } from '@nestjs/common';
import type { Namespace } from 'socket.io';

/** Socket.IO room with every connection of one user. */
export const userRoom = (userId: string) => `user:${userId}`;

/**
 * How the rest of the API talks to connected apps. The chat gateway attaches
 * its namespace on start-up; with the Redis adapter, emits and presence checks
 * reach sockets on every API instance. Without a gateway (e.g. OpenAPI export)
 * everything is a no-op.
 */
@Injectable()
export class RealtimeService {
  private server?: Namespace;

  attach(server: Namespace): void {
    this.server = server;
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  toUsers(userIds: string[], event: string, payload: unknown): void {
    if (userIds.length > 0) this.server?.to(userIds.map(userRoom)).emit(event, payload);
  }

  /** Whether the user has the app open right now (on any instance). */
  async isOnline(userId: string): Promise<boolean> {
    if (!this.server) return false;
    const sockets = await this.server.in(userRoom(userId)).fetchSockets();
    return sockets.length > 0;
  }
}
