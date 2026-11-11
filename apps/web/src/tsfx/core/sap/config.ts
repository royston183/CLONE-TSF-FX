import { SERVICES } from '@tsfx/config/services';
import { HttpError } from '@tsfx/lib/errors';
import type { SapService } from './client';

// SAP is reached through this application's gateway (/api/<service>): the gateway holds the SAP account, the CSRF
// token and the session cookies, so the browser sends none of them. The "account" below is a placeholder that makes the
// core treat the connection as present.

export interface SapServiceConfig { key: string; title: string; binding: string; path: string; base: string }
export interface SapConfig {
  relayUrl: string;
  client: string;
  timeoutMs: number;
  systemId: string;
  account: { username: string; password: string };
  services: Record<string, SapServiceConfig>;
}

export function loadSapConfig(_env: Record<string, string | undefined>): SapConfig {
  const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin;
  return {
    relayUrl: origin,
    client: '100',
    timeoutMs: 60000,
    systemId: 'SAP',
    account: { username: 'GATEWAY', password: 'gateway' },
    services: Object.fromEntries(SERVICES.map(s => [s.key, { ...s, base: `${origin}/api/${s.key}/` }]))
  };
}

export function sapServiceOf(cfg: SapConfig, key: string): SapService {
  const s = Object.hasOwn(cfg.services, key) ? cfg.services[key] : undefined;
  if (!s) throw new HttpError(404, `Unknown SAP service ${key}.`);
  return { key: s.key, base: s.base };
}

export function viteEnv(vite: Record<string, unknown>): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vite)) if (k.startsWith('VITE_') && typeof v === 'string') env[k.slice(5)] = v;
  return env;
}
