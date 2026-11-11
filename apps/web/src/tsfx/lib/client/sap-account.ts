import { checkService, newSapConnection, type SapConnection, type SapService, type SapSettings } from '@tsfx/core/sap/client';
import { loadSapConfig, viteEnv, type SapConfig } from '@tsfx/core/sap/config';
import { HttpError } from '@tsfx/lib/errors';
import { clearDashboardCache } from './dashboard-cache';

// The SAP account of this tab: the build default (VITE_SAP_USERNAME / VITE_SAP_PASSWORD / VITE_SAP_CLIENT) unless the
// person saved another in Settings → SAP Connection (sessionStorage: this tab only, gone when it closes).
const KEY = 'app-sap-account';
export interface SapAccount { username: string; password: string; client: string }
export type CheckResult = Awaited<ReturnType<typeof checkService>>;

// The build's settings, read once (per distinct set of values, so a test can change them).
let built: { key: string; config: SapConfig | null; error: string } | null = null;
function build(): { config: SapConfig | null; error: string } {
  const env = viteEnv(import.meta.env as unknown as Record<string, unknown>);
  const key = JSON.stringify(env);
  if (built?.key !== key) {
    try {
      built = { key, config: loadSapConfig(env), error: '' };
    } catch (e) {
      // Name the build setting as it is written in .env.local (VITE_SAP_CLIENT, not SAP_CLIENT).
      built = { key, config: null, error: `${(e as Error).message.replace('Invalid SAP_', 'Invalid VITE_SAP_')}. Fix it in .env.local and build again.` };
    }
  }
  return built;
}

/** What is wrong with the build's SAP settings ('' when they are valid); the runtime shows it once, at start-up. */
export const buildConfigError = (): string => build().error;

/** The build's SAP settings (VITE_SAP_*). Throws when one is invalid (start-up has then shown the problem). */
export function buildConfig(): SapConfig {
  const { config, error } = build();
  if (!config) throw new HttpError(500, error);
  return config;
}
const buildAccount = (): SapAccount => ({ ...buildConfig().account, client: buildConfig().client });

function saved(): SapAccount | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<SapAccount> | null;
    if (!raw || typeof raw.username !== 'string' || typeof raw.password !== 'string') return null;
    return { username: raw.username, password: raw.password, client: typeof raw.client === 'string' && /^\d{3}$/.test(raw.client) ? raw.client : buildConfig().client };
  } catch { return null; }
}

export const currentAccount = (): SapAccount => saved() ?? buildAccount();

let connection: { key: string; conn: SapConnection } | null = null;
/** The SAP connection of the current account (the same object while the account is unchanged); null without a user and password. */
export function sapConnection(): SapConnection | null {
  const a = currentAccount();
  if (!a.username || !a.password) return null;
  const key = JSON.stringify([a.username, a.password, a.client]);
  if (connection?.key !== key) connection = { key, conn: newSapConnection(a.username, a.password) };
  return connection.conn;
}

export const sapSettings = (): SapSettings => ({ client: currentAccount().client, timeoutMs: buildConfig().timeoutMs });

/** The first SAP service: the one the connection is proved against. */
export function firstService(): SapService {
  const s = Object.values(buildConfig().services)[0];
  if (!s) throw new HttpError(503, 'No SAP service is configured.');
  return { key: s.key, base: s.base };
}

/**
 * Proves an account against the configured services in order, skipping a service SAP says is not published on this
 * system (404): the first that answers proves the account. A rejected user or password (401) or any other failure stops
 * at once, so a wrong password is never sent twice.
 */
export async function checkAnyService(settings: SapSettings, conn: SapConnection): Promise<CheckResult> {
  const services = Object.values(buildConfig().services);
  if (!services.length) throw new HttpError(503, 'No SAP service is configured.');
  let missing: unknown = null;
  for (const [i, s] of services.entries()) {
    try {
      return await checkService(settings, conn, { key: s.key, base: s.base }, { retry: i === 0 });
    } catch (e) {
      if (!(e instanceof HttpError) || e.status !== 404) throw e;
      missing ??= e;
    }
  }
  throw missing instanceof Error ? missing : new HttpError(502, 'No configured SAP service is published on this system.');
}

/**
 * Proves the account against SAP (a paused account is retried once) and saves it for this tab only on success.
 * An empty password keeps the saved one when the user is the same.
 */
export async function testAndSave(account: { username: string; password: string; client?: string }): Promise<CheckResult> {
  // SAP user names are case-insensitive; SAP keeps them in upper case.
  const username = account.username.trim().toUpperCase();
  const current = currentAccount();
  const password = account.password || (username === current.username.toUpperCase() ? current.password : '');
  if (!username || !password) throw new HttpError(400, 'Enter the SAP user and password.');
  const client = account.client?.trim() || current.client;
  if (!/^\d{3}$/.test(client)) throw new HttpError(400, 'The SAP client has three digits.');
  const result = await checkAnyService({ client, timeoutMs: buildConfig().timeoutMs }, newSapConnection(username, password));
  try { sessionStorage.setItem(KEY, JSON.stringify({ username, password, client })); } catch { /* storage blocked: the account is not kept */ }
  connection = null;
  clearDashboardCache();
  return result;
}

/** Forgets this tab's account: the build default applies again. */
export function clearSapAccount(): void {
  clearDashboardCache();
  try { sessionStorage.removeItem(KEY); } catch { /* storage blocked */ }
  connection = null;
}
export const resetAccount = clearSapAccount;

/**
 * Who acts in the application's own data: the SAP user (upper case), else DEMO. A name SAP would not accept (more than
 * 12 characters, or other than letters, digits, `_`, `.` and `-`) is DEMO too.
 */
export function actingUser(): string {
  const user = currentAccount().username.trim().toUpperCase();
  return /^[A-Z0-9_.-]{1,12}$/.test(user) ? user : 'DEMO';
}
