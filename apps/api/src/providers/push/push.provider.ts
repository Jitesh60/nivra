/** A notification for one user's devices. */
export interface PushMessage {
  title: string;
  body: string;
  /** String values only (FCM data payload), e.g. { type: 'chat.message', conversationId }. */
  data: Record<string, string>;
}

export interface PushResult {
  /** Tokens the push service says are gone (app uninstalled, token rotated). */
  invalidTokens: string[];
}

/** Sends push notifications. Swap implementations with PUSH_PROVIDER. */
export abstract class PushProvider {
  abstract send(tokens: string[], message: PushMessage): Promise<PushResult>;
}
