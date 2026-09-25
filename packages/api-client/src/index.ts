import createClient, { type Client } from 'openapi-fetch';
import type { components, paths } from './schema.js';

export type { components, paths };
export type Schemas = components['schemas'];
export type SajhaClient = Client<paths>;

/** `{ error: { code, message, details } }` returned by every failing endpoint. */
export type ApiErrorBody = Schemas['ErrorResponse'];

/**
 * Typed client for the Nivra API. Paths, bodies and responses are checked
 * against the OpenAPI document exported from apps/api.
 *
 *   const api = createSajhaClient('http://localhost:3000', { token });
 *   const { data, error } = await api.GET('/v1/admin/me');
 */
export function createSajhaClient(
  baseUrl: string,
  options: { token?: string; fetch?: typeof fetch } = {},
): SajhaClient {
  return createClient<paths>({
    baseUrl,
    fetch: options.fetch,
    headers: options.token ? { Authorization: `Bearer ${options.token}` } : undefined,
  });
}
