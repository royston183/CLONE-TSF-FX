import { HttpError } from '@tsfx/lib/errors';
import type { Actor } from '../actor';
import { byteLength } from '../crypto';
import type { AppConfig } from './config';

export const APP_HEADER = 'x-app-request';
/** The acting user the browser sends (unverified: the demo setup signs everyone in as demo). */
export const USER_HEADER = 'x-app-user';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: { message: error.message, details: error.details } }, error.status);
  console.error(error);
  return json({ error: { message: 'Something went wrong on the server. Try again.', details: [] } }, 500);
}

/** Runs a route handler body and turns any thrown error into the JSON error shape. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try { return await run(); } catch (error) { return errorResponse(error); }
}

/** Writes must come from this site (or a listed origin) and carry the app header (CSRF protection). */
export function assertTrustedWrite(req: Request, cfg: AppConfig): void {
  const origin = req.headers.get('origin');
  const own = new URL(req.url).origin;
  if (!origin || !(origin === own || cfg.origins.includes(origin)) || req.headers.get(APP_HEADER) !== '1') {
    throw new HttpError(403, 'Untrusted request origin.');
  }
}

export async function readJson(req: Request, limit = 1024 * 1024): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (byteLength(raw) > limit) throw new HttpError(413, `Request exceeds ${Math.max(1, Math.round(limit / 1048576))} MB.`);
  if (!raw) return {};
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) throw new HttpError(415, 'Use application/json.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'Invalid JSON.');
  return value as Record<string, unknown>;
}

/**
 * The acting user of a request: the x-app-user header in upper case when it is a name SAP would accept (1 to 12
 * letters, digits, `_`, `.` or `-`), else DEMO.
 */
export function actingUserOf(value: string | null | undefined): string {
  const user = (value ?? '').trim().toUpperCase();
  return /^[A-Z0-9_.-]{1,12}$/.test(user) ? user : 'DEMO';
}

/** Who a BackEnd request acts for: the sanitized x-app-user (else DEMO), with no SAP connection (the BackEnd never calls SAP). */
export function actorOf(req: Request): Actor {
  const user = actingUserOf(req.headers.get(USER_HEADER));
  return { id: user, username: user, sap: null };
}
