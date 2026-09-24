import { generate } from 'otplib';
import {
  hashRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  totpProvisioning,
  verifyTotp,
} from './totp.js';

describe('TOTP helpers', () => {
  it('accepts the current code and rejects a replay of the same time step', async () => {
    const secret = newTotpSecret();
    const code = await generate({ secret });
    const step = await verifyTotp(secret, code);
    expect(step).toEqual(expect.any(Number));
    expect(await verifyTotp(secret, code, step)).toBeNull();
  });

  it('rejects malformed and wrong codes', async () => {
    const secret = newTotpSecret();
    expect(await verifyTotp(secret, 'abcdef')).toBeNull();
    const code = await generate({ secret });
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect(await verifyTotp(secret, wrong)).toBeNull();
  });

  it('builds an otpauth URL and QR image', async () => {
    const p = await totpProvisioning(newTotpSecret(), 'Sajha Admin', 'ops@sajha.app');
    expect(p.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Sajha%20Admin:ops%40sajha\.app\?secret=/);
    expect(p.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('generates 8 distinct recovery codes whose hash ignores case and spacing', () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/));
    expect(hashRecoveryCode(` ${codes[0]!.toUpperCase()} `)).toBe(hashRecoveryCode(codes[0]!));
  });
});
