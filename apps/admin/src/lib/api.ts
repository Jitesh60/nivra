import 'server-only';

/** Base URL of the Sajha API, read on the server only. */
export const API_URL = process.env.SAJHA_API_URL ?? 'http://localhost:3000';

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
