import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, hmacSha256, randomDigits, randomToken, safeEqualHex } from './crypto.js';

describe('crypto helpers', () => {
  it('generates zero-padded numeric codes of the requested length', () => {
    for (let i = 0; i < 200; i++) expect(randomDigits(6)).toMatch(/^\d{6}$/);
  });

  it('generates distinct URL-safe tokens', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  it('compares HMACs in constant time and depends on the key', () => {
    const h = hmacSha256('123456', 'k1');
    expect(safeEqualHex(h, hmacSha256('123456', 'k1'))).toBe(true);
    expect(safeEqualHex(h, hmacSha256('123456', 'k2'))).toBe(false);
    expect(safeEqualHex(h, 'abcd')).toBe(false);
  });

  it('round-trips AES-GCM and rejects tampering or the wrong key', () => {
    const key = randomBytes(32);
    const box = encrypt('JBSWY3DPEHPK3PXP', key);
    expect(decrypt(box, key)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decrypt(box, randomBytes(32))).toThrow();
    const [iv, tag, data] = box.split('.');
    const flipped = `${iv}.${tag}.${data!.slice(0, -2)}AA`;
    expect(() => decrypt(flipped, key)).toThrow();
  });
});
