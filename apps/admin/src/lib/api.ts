import 'server-only';
import { createSajhaClient, type Schemas } from '@sajha/api-client';
import { redirect } from 'next/navigation';
import { friendlyMessage, toApiError, type ApiError } from './errors';
import { getAccessToken } from './session';

/** Base URL of the Nivra API, read on the server only. */
export const API_URL = process.env.SAJHA_API_URL ?? 'http://localhost:3000';

export type Admin = Schemas['AdminDto'];
export type AdminRole = Admin['role'];

export class ApiRequestError extends Error {
  constructor(readonly error: ApiError) {
    super(friendlyMessage(error));
  }
}

/** Unauthenticated client (login, 2FA, refresh). */
export function publicApi() {
  return createSajhaClient(API_URL);
}

/** Client carrying the signed-in admin's access token. */
export async function adminApi() {
  return createSajhaClient(API_URL, { token: await getAccessToken() });
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/**
 * Unwraps an openapi-fetch result. A dead session (401) or a disabled
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
  if (error.code === 'ACCOUNT_SUSPENDED') redirect('/logout?reason=disabled');
  if (error.code === 'PASSWORD_CHANGE_REQUIRED') redirect('/account/password');
  throw new ApiRequestError(error);
}

export async function getMe(): Promise<Admin> {
  const api = await adminApi();
  return (await unwrap(api.GET('/v1/admin/me'))).admin;
}

export type ApiHealth =
  | { reachable: true; status: 'ok' | 'error'; checks: Record<string, 'up' | 'down'> }
  | { reachable: false };

export async function getApiHealth(): Promise<ApiHealth> {
  try {
    const res = await fetch(`${API_URL}/v1/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
    const body = (await res.json()) as {
      status: 'ok' | 'error';
      checks: Record<string, 'up' | 'down'>;
    };
    return { reachable: true, status: body.status, checks: body.checks };
  } catch {
    return { reachable: false };
  }
}
