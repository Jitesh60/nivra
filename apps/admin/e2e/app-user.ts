import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Helpers that act as the mobile app and as ops tooling, straight against the
 * API. The API must run with OTP_DEV_BYPASS_CODE (000000 by default here).
 */
export const API = process.env.SAJHA_API_URL ?? 'http://localhost:3000';
const OTP = process.env.E2E_OTP_CODE ?? '000000';

/** A real 32×20 JPEG: the API decodes and re-encodes every upload. */
const JPEG = Buffer.from(
  '/9j/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAUACADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFgEBAQEAAAAAAAAAAAAAAAAAAAMG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AiAqxYAAAAAD/2Q==',
  'base64',
);

async function call<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
}

/** Signs up a new app user with phone OTP and sets their name. */
export async function createAppUser(name: string): Promise<AppUser> {
  const phone = `9${String(Date.now()).slice(-9)}`;
  const { challengeId } = await call<{ challengeId: string }>(
    'POST',
    '/auth/otp/request',
    undefined,
    {
      phone: `+91${phone}`,
    },
  );
  const login = await call<{ accessToken: string; user: { id: string } }>(
    'POST',
    '/auth/otp/verify',
    undefined,
    { challengeId, code: OTP, deviceId: `e2e-device-${phone}`, deviceName: 'E2E phone' },
  );
  await call('PATCH', '/me', login.accessToken, { name });
  return { id: login.user.id, name, phone: `+91${phone}`, token: login.accessToken };
}

/** Presigned upload of the test JPEG; returns the upload key. */
async function upload(token: string, purpose = 'DOCUMENT'): Promise<string> {
  const ticket = await call<{ key: string; url: string; headers: Record<string, string> }>(
    'POST',
    '/uploads',
    token,
    { purpose, contentType: 'image/jpeg', sizeBytes: JPEG.length },
  );
  const put = await fetch(ticket.url, { method: 'PUT', headers: ticket.headers, body: JPEG });
  if (!put.ok) throw new Error(`Presigned PUT failed: ${put.status} ${await put.text()}`);
  return ticket.key;
}

export async function submitDocument(
  user: AppUser,
  type: string,
  withBack = false,
): Promise<{ id: string }> {
  const frontKey = await upload(user.token);
  const backKey = withBack ? await upload(user.token) : undefined;
  return call('POST', '/me/documents', user.token, { type, frontKey, backKey });
}

/** Verifies an email for the user (bypass code), so they can list items. */
export async function verifyEmail(user: AppUser): Promise<void> {
  const { challengeId } = await call<{ challengeId: string }>(
    'POST',
    '/auth/email/otp/request',
    user.token,
    { email: `lender.${user.phone.slice(3)}@example.com` },
  );
  await call('POST', '/auth/email/otp/verify', user.token, { challengeId, code: OTP });
}

export interface ListingInput {
  title: string;
  categorySlug?: string;
}

/** Creates a listing with one photo and a required document, then publishes it. */
export async function publishListing(
  user: AppUser,
  input: ListingInput,
): Promise<{ id: string; status: string; inReview: boolean }> {
  const categories = await call<{ id: string; slug: string }[]>('GET', '/categories');
  const category = categories.find((c) => c.slug === (input.categorySlug ?? 'trekking-outdoor'))!;
  const listing = await call<{ id: string }>('POST', '/me/listings', user.token, {
    categoryId: category.id,
    title: input.title,
    description: 'Created by the admin end-to-end tests. Pegs and bag included.',
    condition: 'GOOD',
    pricePerDayPaise: 15_000,
    weeklyDiscountPct: 10,
    depositPaise: 100_000,
    lat: 18.507412,
    lng: 73.807739,
    areaLabel: 'Kothrud, Pune',
    exactAddress: 'Flat 4B, Sai Residency, Paud Road',
  });
  const key = await upload(user.token, 'LISTING_PHOTO');
  await call('POST', `/me/listings/${listing.id}/photos`, user.token, { key });
  await call('PUT', `/me/listings/${listing.id}/required-docs`, user.token, {
    items: [{ docType: 'GOVERNMENT_ID' }],
  });
  const result = await call<{ listing: { status: string }; inReview: boolean }>(
    'POST',
    `/me/listings/${listing.id}/publish`,
    user.token,
  );
  return { id: listing.id, status: result.listing.status, inReview: result.inReview };
}

/** The lender's own view of a listing. */
export function myListing(user: AppUser, id: string) {
  return call<{ status: string; rejectionReason: string | null; category: { slug: string } }>(
    'GET',
    `/me/listings/${id}`,
    user.token,
  );
}

/** Public GET /v1/listings/:id status (200 only while LIVE). */
export async function publicListingStatus(id: string): Promise<number> {
  return (await fetch(`${API}/v1/listings/${id}`)).status;
}

export async function publicCategories(): Promise<{ slug: string }[]> {
  return call('GET', '/categories');
}

/** GET /v1/me as the user; returns the HTTP status and body. */
export async function me(user: AppUser) {
  const res = await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${user.token}` } });
  return { status: res.status, body: (await res.json()) as { user?: { idVerified: boolean } } };
}

/** Seeds an admin with a known password (no forced change) via the API's seed script. */
export function seedAdmin(role: 'OPS' | 'SUPPORT', run: number, tag = 'docs') {
  const admin = {
    email: `e2e-${role.toLowerCase()}-${tag}-${run}@sajha.app`,
    name: `E2E ${role === 'OPS' ? 'Ops' : 'Support'} Reviewer`,
    password: 'e2e reviewer long passphrase',
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
      admin.name,
      '--password',
      admin.password,
      '--role',
      role,
    ],
    { stdio: 'inherit', cwd: resolve(__dirname, '../../..') },
  );
  return admin;
}
