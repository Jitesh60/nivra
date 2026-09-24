import { randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { sha256 } from '../../common/crypto/crypto.js';

export const RECOVERY_CODE_COUNT = 8;
/** Accept the previous and next 30-second window to allow for clock drift. */
const EPOCH_TOLERANCE_SEC = 30;

export function newTotpSecret(): string {
  return generateSecret();
}

export async function totpProvisioning(
  secret: string,
  issuer: string,
  account: string,
): Promise<{ otpauthUrl: string; qrDataUrl: string }> {
  const otpauthUrl = generateURI({ issuer, label: account, secret });
  return { otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 }) };
}

/**
 * Returns the matched time step, or null. Pass the last accepted step so a code
 * can't be used twice (replay protection).
 */
export async function verifyTotp(
  secret: string,
  code: string,
  lastTimeStep?: number | null,
): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const result = await verify({
    secret,
    token: code,
    epochTolerance: EPOCH_TOLERANCE_SEC,
    ...(lastTimeStep != null ? { afterTimeStep: lastTimeStep } : {}),
  }).catch(() => ({ valid: false as const }));
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Recovery codes look like `k7rq-2mxp-9tzc` (≈70 bits of entropy each). */
export function newRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const bytes = randomBytes(12);
    const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join(
      '',
    );
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return sha256(code.trim().toLowerCase().replace(/\s+/g, ''));
}
