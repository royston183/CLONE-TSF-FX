// How the vendored TSF_FX screens run inside this application: SAP and the SLC middleware are reached through the
// gateway (/api/<service>), in this page; nothing of its own is kept. (The AI proposals call a gateway route.)
import { setPlatform } from '@tsfx/core/platform';
import { browserPlatform } from '@tsfx/lib/client/browser-platform';
import { buildConfig } from '@tsfx/lib/client/sap-account';

export const APP_TYPE = 'frontend' as 'fullstack' | 'frontend';
export const APP_THEME = 'tiles' as 'tiles' | 'normal';

let started = false;
/** Sets the browser platform once. */
export function startRuntime(): string {
  if (!started) { setPlatform(browserPlatform(buildConfig(), APP_TYPE)); started = true; }
  return '';
}
