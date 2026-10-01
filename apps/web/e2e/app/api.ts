import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { JPEG, OTP } from './helpers';

/**
 * Test data straight through the API (as the Android app and an Ops admin
 * would), so the web tests can focus on the pages under test.
 */
export const API = process.env.SAJHA_API_URL ?? 'http://localhost:3000';

async function call<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface AppUser {
  id: string;
  name: string;
  phone: string;
  token: string;
  /** When this number may ask for a new SMS code (the API's resend cooldown). */
  codeAgainAt: number;
}

/** Each API-made user asks for codes from their own IP (documentation range). */
const phoneIp = (phone: string) => ({
  'x-forwarded-for': `198.51.100.${(Number(phone.slice(-6)) % 254) + 1}`,
});

let seq = 0;

/** A new app user with a name and a verified email (ready to list and book). */
export async function createAppUser(name: string): Promise<AppUser> {
  seq += 1;
  const phone = `9${String(Date.now() * 10 + (seq % 10)).slice(-9)}`;
  const { challengeId } = await call<{ challengeId: string }>(
    'POST',
    '/auth/otp/request',
    undefined,
    { phone },
    phoneIp(phone),
  );
  const login = await call<{ accessToken: string; user: { id: string } }>(
    'POST',
    '/auth/otp/verify',
    undefined,
    { challengeId, code: OTP, deviceId: `web-e2e-${phone}`, deviceName: 'Web e2e' },
  );
  const token = login.accessToken;
  await call('PATCH', '/me', token, { name });
  const email = await call<{ challengeId: string }>(
    'POST',
    '/auth/email/otp/request',
    token,
    { email: `api.${phone}@example.com` },
    phoneIp(phone),
  );
  await call('POST', '/auth/email/otp/verify', token, {
    challengeId: email.challengeId,
    code: OTP,
  });
  return { id: login.user.id, name, phone, token, codeAgainAt: Date.now() + 31_000 };
}

async function uploadPhoto(token: string, purpose = 'LISTING_PHOTO'): Promise<string> {
  const ticket = await call<{ key: string; url: string; headers: Record<string, string> }>(
    'POST',
    '/uploads',
    token,
    { purpose, contentType: 'image/jpeg', sizeBytes: JPEG.length },
  );
  const put = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: JPEG });
  if (!put.ok) throw new Error(`Presigned PUT failed: ${put.status}`);
  return ticket.key;
}

export interface ListingInput {
  title: string;
  description?: string;
  categorySlug?: string;
  pricePerDayPaise?: number;
  requireId?: boolean;
}

/** Creates, publishes and (as Ops) approves a listing, so it's live and searchable. */
export async function liveListing(lender: AppUser, input: ListingInput): Promise<{ id: string }> {
  const categories = await call<{ id: string; slug: string }[]>('GET', '/categories');
  const category =
    categories.find((c) => c.slug === (input.categorySlug ?? 'trekking-outdoor')) ?? categories[0]!;
  const listing = await call<{ id: string }>('POST', '/me/listings', lender.token, {
    categoryId: category.id,
    title: input.title,
    description: input.description ?? 'Made by the website end-to-end tests. Well looked after.',
    condition: 'GOOD',
    pricePerDayPaise: input.pricePerDayPaise ?? 15_000,
    weeklyDiscountPct: 10,
    depositPaise: 100_000,
    lat: 18.507412,
    lng: 73.807739,
    areaLabel: 'Kothrud, Pune',
    exactAddress: 'Flat 4B, Sai Residency, Paud Road',
  });
  const key = await uploadPhoto(lender.token);
  await call('POST', `/me/listings/${listing.id}/photos`, lender.token, { key });
  if (input.requireId) {
    await call('PUT', `/me/listings/${listing.id}/required-docs`, lender.token, {
      items: [{ docType: 'GOVERNMENT_ID' }],
    });
  }
  const published = await call<{ inReview: boolean }>(
    'POST',
    `/me/listings/${listing.id}/publish`,
    lender.token,
  );
  if (published.inReview)
    await call('POST', `/admin/listings/${listing.id}/approve`, await opsToken());
  return listing;
}

/** A booking requested, accepted and paid (test payment): status CONFIRMED. */
export async function confirmedBooking(
  borrower: AppUser,
  lender: AppUser,
  listingId: string,
  startDate: string,
  endDate: string,
): Promise<{ id: string }> {
  const booking = await call<{ id: string }>('POST', '/bookings', borrower.token, {
    listingId,
    startDate,
    endDate,
  });
  await call('POST', `/bookings/${booking.id}/accept`, lender.token);
  const order = await call<{ orderId: string }>(
    'POST',
    `/bookings/${booking.id}/pay`,
    borrower.token,
  );
  const paid = await call<{ paymentId: string; signature: string }>(
    'POST',
    `/dev/payments/${order.orderId}/checkout`,
    borrower.token,
    { outcome: 'success', webhook: 'never' },
  );
  await call('POST', '/payments/verify', borrower.token, {
    orderId: order.orderId,
    paymentId: paid.paymentId,
    signature: paid.signature,
  });
  return booking;
}

/** Ops settles a booking's open dispute (completing the booking). */
export async function resolveDispute(bookingId: string, keptPaise: number): Promise<void> {
  const token = await opsToken();
  const page = await call<{ items: { id: string; bookingId: string }[] }>(
    'GET',
    '/admin/disputes?status=OPEN&limit=100',
    token,
  );
  const dispute = page.items.find((d) => d.bookingId === bookingId);
  if (!dispute) throw new Error(`No open dispute for booking ${bookingId}`);
  await call('POST', `/admin/disputes/${dispute.id}/resolve`, token, {
    keptPaise,
    note: 'Split fairly from both sides’ photos.',
  });
}

/** Approves a listing in review, as Ops. */
export async function approveListing(id: string): Promise<void> {
  await call('POST', `/admin/listings/${id}/approve`, await opsToken());
}

// ── Ops admin (approves first listings) ──

let ops: Promise<string> | undefined;

/** An Ops admin's access token: seeded once per test worker, 2FA done with TOTP. */
function opsToken(): Promise<string> {
  ops ??= (async () => {
    const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const admin = {
      email: `web-e2e-ops-${run}@sajha.app`,
      password: 'web e2e ops long passphrase',
    };
    execFileSync(
      'pnpm',
      [
        '--filter',
        '@sajha/api',
        'seed:admin',
        '--',
        '--email',
        admin.email,
        '--name',
        'Web E2E Ops',
        '--password',
        admin.password,
        '--role',
        'OPS',
      ],
      { stdio: 'ignore', cwd: resolve(__dirname, '../../../..') },
    );
    const { mfaToken } = await call<{ mfaToken: string }>(
      'POST',
      '/admin/auth/login',
      undefined,
      admin,
    );
    const { otpauthUrl } = await call<{ otpauthUrl: string }>(
      'POST',
      '/admin/auth/2fa/setup',
      undefined,
      {
        mfaToken,
      },
    );
    const secret = new URL(otpauthUrl).searchParams.get('secret')!;
    const session = await call<{ accessToken: string }>(
      'POST',
      '/admin/auth/2fa/verify',
      undefined,
      {
        mfaToken,
        code: totp(secret),
      },
    );
    return session.accessToken;
  })();
  return ops;
}

/** RFC 6238 code (SHA-1, 6 digits, 30 s) for a base32 secret. */
function totp(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of base32.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}
