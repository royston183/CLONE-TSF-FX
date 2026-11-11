import type { SapConnection } from './sap/client';

/**
 * Who a service call acts for: `id` keys per-user caches (lookups), `username` stamps created/changed rows and owns
 * personal layouts, `sap` is the SAP connection for `sap` modules (null when there is none).
 */
export interface Actor {
  id: string;
  username: string;
  sap: SapConnection | null;
}
