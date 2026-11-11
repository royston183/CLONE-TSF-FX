import { z } from 'zod';
import { galleryEnabled } from '@tsfx/lib/gallery';
import { SERVER_MODULES, sourceOf } from '@tsfx/modules/server-registry';
import { platform } from '../platform';

/**
 * What the core's services need from where they run: the origins that may write (the BackEnd's CORS and write guard)
 * and NODE_ENV (the UI Gallery). SAP settings are the browser's (core/sap/config.ts); the BackEnd never calls SAP.
 */
export interface AppConfig {
  origins: string[];
  /** NODE_ENV: the UI Gallery is on outside production. */
  nodeEnv: string;
}

const blank = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v);
const text = z.preprocess(blank, z.string().optional());
const schema = z.object({
  APP_ORIGINS: text,
  FRONTEND_PORT: z.preprocess(blank, z.coerce.number().int().min(1).max(65535).optional()),
  WEBSITE_CORS_ALLOWED_ORIGINS: text,
  NODE_ENV: text
});

/** An origin the platform's CORS list may grant: a website (https), or the iOS app's WebView (capacitor://localhost). */
const grantable = (origin: string): boolean => origin.startsWith('https://') || origin === 'capacitor://localhost';

function platformOrigins(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string' && grantable(item));
  } catch { /* App Service can expose the value as a plain comma-separated string. */ }
  return value.split(/[ ,]+/).map(origin => origin.trim()).filter(grantable);
}

/** Reads and validates the environment. Throws with the variable name when a value is wrong. */
export function loadConfig(env: Record<string, string | undefined> = platform().env()): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid ${issue.path.join('.')}: ${issue.message}`);
  }
  const e = parsed.data;
  const azureOrigins = platformOrigins(e.WEBSITE_CORS_ALLOWED_ORIGINS);
  // Unset APP_ORIGINS: the provisioner's CORS origins on Azure, else the FrontEnd's host names on its port
  // (FRONTEND_PORT, default 3100). The FrontEnd and the BackEnd run on two ports, so the FrontEnd's origin calls this API.
  const origins = e.APP_ORIGINS
    ? e.APP_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : azureOrigins.length
      ? azureOrigins
      : [`http://127.0.0.1:${e.FRONTEND_PORT ?? 3100}`, `http://localhost:${e.FRONTEND_PORT ?? 3100}`];
  return { origins, nodeEnv: e.NODE_ENV ?? 'development' };
}

const g = globalThis as { __appConfig?: AppConfig };
/** The process configuration, read once (restart the BackEnd after changing .env.local). */
export const getConfig = (): AppConfig => (g.__appConfig ??= loadConfig());
/** Forget the cached configuration (tests). */
export const resetConfig = (): void => { g.__appConfig = undefined; };

/**
 * The UI Gallery and its sample modules: on outside production, or while no module reads SAP. The browser passes
 * `production` for a built page.
 */
export const galleryOn = (cfg: AppConfig): boolean => galleryEnabled(cfg.nodeEnv, Object.values(SERVER_MODULES).some(m => sourceOf(m) === 'sap'));
