import type { ErrorEvent } from '@sentry/nestjs';
import { scrubBreadcrumb, scrubEvent, scrubText } from './scrub.js';

describe('Sentry scrubbing', () => {
  it('removes phone numbers, emails and codes from text', () => {
    expect(scrubText('OTP for +919876543210 failed')).toBe('OTP for [redacted] failed');
    expect(scrubText('user 9876543210 and rahul@example.com')).toBe(
      'user [redacted] and [redacted]',
    );
    expect(scrubText('/v1/x?code=482913&page=2&token=abc')).toBe(
      '/v1/x?code=[redacted]&page=2&token=[redacted]',
    );
    // Ids and amounts stay.
    expect(scrubText('booking 01a0d4b3 total 149500')).toBe('booking 01a0d4b3 total 149500');
  });

  it('drops bodies, cookies, auth headers and everything about the user but the id', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'Failed for rahul@example.com',
      request: {
        url: 'https://api.sajha.app/v1/auth/otp/verify?code=123456',
        data: { phone: '+919876543210', code: '123456' },
        cookies: { sajha_admin_at: 'secret' },
        headers: { Authorization: 'Bearer abc', 'user-agent': 'app' },
        query_string: 'code=123456',
      },
      user: { id: 'u1', email: 'rahul@example.com', ip_address: '1.2.3.4' },
      exception: { values: [{ type: 'Error', value: 'No user +919876543210' }] },
      breadcrumbs: [{ message: 'called 9876543210', data: { url: '/x?otp=111111' } }],
    } as ErrorEvent);
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({ Authorization: '[redacted]', 'user-agent': 'app' });
    expect(event.request?.url).toBe('https://api.sajha.app/v1/auth/otp/verify?code=[redacted]');
    expect(event.request?.query_string).toBe('code=[redacted]');
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.message).toBe('Failed for [redacted]');
    expect(event.exception?.values?.[0]?.value).toBe('No user [redacted]');
    expect(event.breadcrumbs?.[0]).toEqual({
      message: 'called [redacted]',
      data: { url: '/x?otp=[redacted]' },
    });
  });

  it('keeps breadcrumbs without text as they are', () => {
    expect(scrubBreadcrumb({ category: 'http' })).toEqual({ category: 'http' });
  });
});
