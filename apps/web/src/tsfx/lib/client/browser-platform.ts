// The core's platform in this page: SAP modules through the gateway, the SLC middleware through the gateway too.
import type { Actor } from '@tsfx/core/actor';
import type { Platform } from '@tsfx/core/platform';
import { getConfig, type AppConfig } from '@tsfx/core/server/config';
import { memoryLayoutStore, memoryStateStore, moduleLocalBackend } from '@tsfx/core/server/local-store';
import { odataBackend } from '@tsfx/core/server/odata-backend';
import { restBackend } from '@tsfx/core/server/rest-backend';
import { sourceOf } from '@tsfx/modules/server-registry';
import { contractOf } from '@tsfx/modules/tables';
import { sapServiceOf, type SapConfig } from '@tsfx/core/sap/config';
import { actingUser, currentAccount, sapConnection } from './sap-account';

export type AppType = 'fullstack' | 'frontend';
const envOf = (): Record<string, string | undefined> => ({ NODE_ENV: 'production' });

export function browserPlatform(sap: SapConfig, _appType: AppType): Platform {
  return {
    env: envOf,
    sapFetchInit: { credentials: 'same-origin' },
    keeps: () => true,
    backend(id, entry) {
      const source = sourceOf(entry);
      if (source === 'sap') return odataBackend({ service: sapServiceOf(sap, entry.def.serviceKey), settings: { client: currentAccount().client, timeoutMs: sap.timeoutMs } }, entry.def, contractOf(entry));
      if (source === 'rest' && entry.rest) {
        return restBackend(id, entry, { key: entry.rest.service, title: 'SLC middleware', base: `${location.origin}/api/middleware`, headers: {} });
      }
      return moduleLocalBackend(id, entry, memoryStateStore());
    },
    scope: entry => (sourceOf(entry) === 'sap' ? `${sap.services[entry.def.serviceKey]?.base ?? ''}|${currentAccount().client}` : ''),
    layouts: () => memoryLayoutStore()
  };
}

export const browserConfig = (): AppConfig => getConfig();

export function browserActor(): Actor {
  const user = actingUser();
  return { id: `tab|${user}`, username: user, sap: sapConnection() };
}
