import { Injectable, Logger } from '@nestjs/common';
import { type PushMessage, PushProvider, type PushResult } from './push.provider.js';

/** Logs pushes instead of sending them (development, or until Firebase is set up). */
@Injectable()
export class ConsolePushProvider extends PushProvider {
  private readonly logger = new Logger('Push');

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    this.logger.log(
      `[console] to ${tokens.length} device(s): ${message.title} — ${message.body} ${JSON.stringify(message.data)}`,
    );
    return { invalidTokens: [] };
  }
}
