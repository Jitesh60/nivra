import argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** argon2id with the library's OWASP-aligned defaults. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}

/**
 * Hash of a random password, compared against when the email is unknown so a failed
 * login takes the same time whether or not the admin exists.
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(`dummy-${Math.random()}`);
  return dummyHash;
}
