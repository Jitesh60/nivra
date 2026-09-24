import { Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { type PushMessage, PushProvider, type PushResult } from './push.provider.js';

export interface FcmConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

type Fetch = typeof fetch;

/**
 * Firebase Cloud Messaging, HTTP v1 API, authenticated with a service account.
 * One request per token (the v1 API has no multicast); tokens FCM reports as
 * unregistered are returned so the caller can delete them.
 */
export class FcmPushProvider extends PushProvider {
  private readonly logger = new Logger('Push');
  private readonly auth: JWT;

  constructor(
    private readonly config: FcmConfig,
    private readonly http: Fetch = fetch,
    auth?: JWT,
  ) {
    super();
    this.auth =
      auth ??
      new JWT({
        email: config.clientEmail,
        key: config.privateKey,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    if (tokens.length === 0) return { invalidTokens: [] };
    const { token: accessToken } = await this.auth.getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${this.config.projectId}/messages:send`;
    const invalidTokens: string[] = [];
    await Promise.all(
      tokens.map(async (token) => {
        const res = await this.http(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: message.data,
              android: { priority: 'high', notification: { channel_id: 'chat' } },
              apns: { payload: { aps: { sound: 'default' } } },
            },
          }),
        });
        if (res.ok) return;
        const text = await res.text();
        // 404 UNREGISTERED / 400 INVALID_ARGUMENT on the token: stop using it.
        if (res.status === 404 || /UNREGISTERED|registration token/i.test(text)) {
          invalidTokens.push(token);
        } else {
          this.logger.warn(`FCM send failed (${res.status}): ${text.slice(0, 200)}`);
        }
      }),
    );
    return { invalidTokens };
  }
}
