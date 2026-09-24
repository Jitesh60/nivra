import { describe, expect, it } from 'vitest';
import { effectiveStatus, offerExpiresAt, offerRent } from './offer-rules.js';

const at = (iso: string) => new Date(iso);

describe('offer rules', () => {
  it('expires after 48 hours when the rental is further out', () => {
    expect(offerExpiresAt(at('2026-10-01T10:00:00Z'), at('2026-10-20T00:00:00Z'))).toEqual(
      at('2026-10-03T10:00:00Z'),
    );
  });

  it('expires at the end of the first rental day when that is sooner', () => {
    expect(offerExpiresAt(at('2026-10-01T10:00:00Z'), at('2026-10-02T00:00:00Z'))).toEqual(
      at('2026-10-03T00:00:00Z'),
    );
  });

  it('treats a pending offer past its expiry as expired, and nothing else', () => {
    const expiresAt = at('2026-10-03T10:00:00Z');
    const before = at('2026-10-03T09:59:59Z');
    const after = at('2026-10-03T10:00:00Z');
    expect(effectiveStatus({ status: 'PENDING', expiresAt }, before)).toBe('PENDING');
    expect(effectiveStatus({ status: 'PENDING', expiresAt }, after)).toBe('EXPIRED');
    expect(effectiveStatus({ status: 'ACCEPTED', expiresAt }, after)).toBe('ACCEPTED');
    expect(effectiveStatus({ status: 'DECLINED', expiresAt }, after)).toBe('DECLINED');
  });

  it('prices a negotiated offer without the weekly discount', () => {
    expect(offerRent(12_000, 8)).toBe(96_000);
  });
});
