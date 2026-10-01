import 'server-only';
import { createSajhaClient, type Schemas } from '@sajha/api-client';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { friendlyMessage, toApiError, type ApiError } from './errors';
import { getAccessToken } from './session';

/**
 * Base URL of the Nivra API for server-side calls. SAJHA_API_URL is read at
 * run time; the public variable (build time) is the fallback.
 */
export const SERVER_API_URL = (
  process.env.SAJHA_API_URL ??
  process.env.NEXT_PUBLIC_SAJHA_API_URL ??
  'http://localhost:3000'
).replace(/\/$/, '');

export type User = Schemas['UserDto'];

export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(friendlyMessage(error));
  }
}

/**
 * Every API call comes from this server, so it passes the visitor's IP and
 * browser on (proved with WEB_CLIENT_SECRET, which the API shares). Without
 * it, all web visitors would share this server's OTP and browsing limits.
 */
const WEB_CLIENT_SECRET = process.env.WEB_CLIENT_SECRET;

async function visitorHeaders(): Promise<Record<string, string>> {
  if (!WEB_CLIENT_SECRET) return {};
  let incoming: Headers;
  try {
    incoming = await headers();
  } catch {
    return {}; // outside a request (build time)
  }
  const ip =
    incoming.get('x-forwarded-for')?.split(',')[0]?.trim() || incoming.get('x-real-ip') || '';
  const forwarded: Record<string, string> = { 'x-nivra-web-key': WEB_CLIENT_SECRET };
  if (ip) forwarded['x-nivra-client-ip'] = ip;
  const ua = incoming.get('user-agent');
  if (ua) forwarded['x-nivra-client-ua'] = ua.slice(0, 512);
  return forwarded;
}

function forwardingFetch(extra: Record<string, string>): typeof fetch {
  return (input, init) => {
    const request = new Request(input, init);
    for (const [name, value] of Object.entries(extra)) request.headers.set(name, value);
    return fetch(request, { cache: 'no-store' });
  };
}

/** Unauthenticated client (sign-in, public browsing). */
export async function publicApi() {
  return createSajhaClient(SERVER_API_URL, { fetch: forwardingFetch(await visitorHeaders()) });
}

/** Client carrying the signed-in user's access token (none for guests). */
export async function userApi() {
  return createSajhaClient(SERVER_API_URL, {
    token: await getAccessToken(),
    fetch: forwardingFetch(await visitorHeaders()),
  });
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Unwraps an openapi-fetch result. A dead session (401) or a suspended
 * account ends the session via /logout; other errors throw ApiRequestError.
 */
export async function unwrap<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await request;
  } catch {
    throw new ApiRequestError({ code: 'NETWORK', message: 'API unreachable' });
  }
  if (result.response.ok) return result.data as T;

  const error = toApiError(result.error);
  if (result.response.status === 401) redirect('/logout?reason=expired');
  if (error.code === 'ACCOUNT_SUSPENDED') redirect('/logout?reason=suspended');
  throw new ApiRequestError(error);
}

/**
 * For Server Functions: runs an API call and returns `{ error }` with a
 * friendly message instead of throwing (redirects still propagate).
 */
export async function attempt<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; error: string; apiError: ApiError }> {
  try {
    return { ok: true, data: await run() };
  } catch (e) {
    if (e instanceof ApiRequestError) return { ok: false, error: e.message, apiError: e.error };
    throw e;
  }
}

export async function getMe(): Promise<User> {
  const api = await userApi();
  return (await unwrap(api.GET('/v1/me'))).user;
}

/** The signed-in user, or null for guests (never redirects). */
export async function getMeOrNull(): Promise<User | null> {
  if (!(await getAccessToken())) return null;
  try {
    const { data } = await (await userApi()).GET('/v1/me');
    return data?.user ?? null;
  } catch {
    return null;
  }
}
