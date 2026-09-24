import type { PushMessage, PushResult } from '../../src/providers/push/push.provider.js';
import { PushProvider } from '../../src/providers/push/push.provider.js';

/** Records pushes instead of sending them. Tokens in `invalid` are reported as gone. */
export class InMemoryPushProvider extends PushProvider {
  readonly sent: { tokens: string[]; message: PushMessage }[] = [];
  readonly invalid = new Set<string>();

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    if (tokens.length > 0) this.sent.push({ tokens, message });
    return { invalidTokens: tokens.filter((t) => this.invalid.has(t)) };
  }

  /** Pushes that went to [token]. */
  to(token: string): PushMessage[] {
    return this.sent.filter((s) => s.tokens.includes(token)).map((s) => s.message);
  }
}
