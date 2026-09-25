import { REQUEST_RULES, requestExpiresAt } from './request-rules.js';

describe('request expiry', () => {
  const now = new Date('2026-10-01T10:00:00Z');

  it('is the day after the end date', () => {
    expect(requestExpiresAt(now, new Date('2026-10-05T00:00:00Z')).toISOString()).toBe(
      '2026-10-06T00:00:00.000Z',
    );
  });

  it('is at most 30 days away, and 30 days without dates', () => {
    const cap = new Date(now.getTime() + REQUEST_RULES.maxDays * 86_400_000);
    expect(requestExpiresAt(now, new Date('2027-01-01T00:00:00Z'))).toEqual(cap);
    expect(requestExpiresAt(now, null)).toEqual(cap);
  });
});
