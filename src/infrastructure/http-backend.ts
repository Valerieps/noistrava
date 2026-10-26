// The API over HTTP, same origin. Inputs always go in a JSON body, never in the URL
// (docs/SEGURANCA.md: no personal data in URLs).
import type { ApiError, ApiResult } from '../application/api-contract';
import type { Backend } from '../application/ports';

async function post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, error: 'unavailable' };
  }
  const payload = (await response.json().catch(() => ({}))) as { value?: T; error?: ApiError };
  if (response.ok) return { ok: true, value: payload.value as T };
  return { ok: false, error: payload.error ?? 'unavailable' };
}

export function httpBackend(): Backend {
  return {
    query: (name, input) => post(`/api/query/${name}`, input),
    command: (name, input) => post(`/api/command/${name}`, input),
    signOut: async () => {
      await post('/api/auth/logout', {});
    },
    devSignIn: (email, name) => post('/api/auth/dev', { email, name }),
    signInUrl: '/api/auth/login',
  };
}
