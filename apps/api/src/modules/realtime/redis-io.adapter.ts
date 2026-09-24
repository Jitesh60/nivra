import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO over Redis pub/sub, so events emitted on one API instance reach
 * sockets connected to another (and presence checks see all of them).
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly pub: Redis;
  private readonly sub: Redis;

  constructor(app: INestApplicationContext, redisUrl: string) {
    super(app);
    this.pub = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
    this.sub = this.pub.duplicate();
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    // The app connects over WebSocket; long-polling isn't needed.
    const server = super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
    } as ServerOptions) as Server;
    server.adapter(createAdapter(this.pub, this.sub));
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}
