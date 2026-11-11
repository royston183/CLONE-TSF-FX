// The one place the vendored screens call a route of their own: the gateway's AI routes of Propose Tradeflow
// (/api/tsfx-ai/*; the Anthropic key stays in the gateway). Everything else goes to SAP or the middleware through the
// gateway's /api/<service> proxy.
import { HttpError, type ErrorDetail } from '@tsfx/lib/errors';

export async function backendApi<T = unknown>(path: string, { method = 'GET', body, signal }: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/tsfx-ai${path.replace(/^\/ai/, '')}`, {
      method,
      credentials: 'same-origin',
      ...(signal ? { signal } : {}),
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body === undefined ? null : JSON.stringify(body)
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new HttpError(503, 'Cannot reach the gateway.');
  }
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { throw new HttpError(response.status >= 400 ? response.status : 502, `The gateway did not return JSON (HTTP ${response.status}).`); }
  if (!response.ok) {
    const error = (data as { error?: { message?: string; details?: ErrorDetail[] } } | null)?.error;
    throw new HttpError(response.status, error?.message || `Request failed (${response.status}).`, error?.details ?? []);
  }
  return data as T;
}
