import type { Request } from 'express';
import { clientInfoFrom, WEB_HEADERS } from './client-info.js';

const SECRET = 'web-client-secret-0123456789abcdef0123';

function req(headers: Record<string, string>, ip = '10.0.0.5'): Request {
  return { ip, headers } as unknown as Request;
}

describe('clientInfoFrom', () => {
  const before = process.env.WEB_CLIENT_SECRET;
  afterEach(() => {
    if (before === undefined) delete process.env.WEB_CLIENT_SECRET;
    else process.env.WEB_CLIENT_SECRET = before;
  });

  it('uses the socket IP and user agent by default', () => {
    delete process.env.WEB_CLIENT_SECRET;
    expect(clientInfoFrom(req({ 'user-agent': 'App/1.0' }))).toEqual({
      ip: '10.0.0.5',
      userAgent: 'App/1.0',
    });
  });

  it('takes the visitor IP and browser from the website server holding the secret', () => {
    process.env.WEB_CLIENT_SECRET = SECRET;
    const info = clientInfoFrom(
      req({
        'user-agent': 'node',
        [WEB_HEADERS.key]: SECRET,
        [WEB_HEADERS.ip]: '203.0.113.9',
        [WEB_HEADERS.userAgent]: 'Mozilla/5.0',
      }),
    );
    expect(info).toEqual({ ip: '203.0.113.9', userAgent: 'Mozilla/5.0' });
  });

  it('ignores the forwarded values without the right secret', () => {
    process.env.WEB_CLIENT_SECRET = SECRET;
    for (const key of [undefined, 'wrong', `${SECRET}x`]) {
      const headers: Record<string, string> = { [WEB_HEADERS.ip]: '203.0.113.9' };
      if (key) headers[WEB_HEADERS.key] = key;
      expect(clientInfoFrom(req(headers)).ip).toBe('10.0.0.5');
    }
  });

  it('ignores them when no secret is configured', () => {
    delete process.env.WEB_CLIENT_SECRET;
    const headers = { [WEB_HEADERS.key]: '', [WEB_HEADERS.ip]: '203.0.113.9' };
    expect(clientInfoFrom(req(headers)).ip).toBe('10.0.0.5');
  });

  it('keeps the socket IP when the forwarded one is not an IP', () => {
    process.env.WEB_CLIENT_SECRET = SECRET;
    const headers = { [WEB_HEADERS.key]: SECRET, [WEB_HEADERS.ip]: 'evil; drop table' };
    expect(clientInfoFrom(req(headers)).ip).toBe('10.0.0.5');
  });
});
