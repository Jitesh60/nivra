import type { JWT } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import { FcmPushProvider } from './fcm-push.provider.js';

const message = { title: 'New message', body: 'Hi', data: { type: 'chat.message' } };
const auth = { getAccessToken: async () => ({ token: 'oauth-token' }) } as unknown as JWT;

describe('FcmPushProvider', () => {
  it('sends one v1 request per token and reports unregistered ones', async () => {
    const http = vi.fn(async (_url: string, init: RequestInit) => {
      const token = (JSON.parse(init.body as string) as { message: { token: string } }).message
        .token;
      if (token === 'gone') {
        return new Response(
          '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}',
          {
            status: 404,
          },
        );
      }
      if (token === 'flaky') return new Response('oops', { status: 500 });
      return new Response('{}', { status: 200 });
    });
    const fcm = new FcmPushProvider(
      { projectId: 'sajha-test', clientEmail: 'x@y', privateKey: 'k' },
      http as unknown as typeof fetch,
      auth,
    );

    const result = await fcm.send(['ok', 'gone', 'flaky'], message);

    expect(result.invalidTokens).toEqual(['gone']);
    expect(http).toHaveBeenCalledTimes(3);
    const [url, init] = http.mock.calls[0]!;
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/sajha-test/messages:send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer oauth-token');
    expect(JSON.parse(init.body as string).message).toMatchObject({
      token: 'ok',
      notification: { title: 'New message', body: 'Hi' },
      data: { type: 'chat.message' },
    });
  });

  it('does nothing without tokens', async () => {
    const http = vi.fn();
    const fcm = new FcmPushProvider(
      { projectId: 'p', clientEmail: 'x', privateKey: 'k' },
      http as unknown as typeof fetch,
      auth,
    );
    expect(await fcm.send([], message)).toEqual({ invalidTokens: [] });
    expect(http).not.toHaveBeenCalled();
  });
});
