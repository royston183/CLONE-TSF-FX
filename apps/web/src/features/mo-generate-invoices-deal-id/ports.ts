/**
 * The middleware behind workflow.ts's Ports. The only module of the feature that performs writes
 * for the multi-step operations; it reaches the SLC middleware's generic resources (shared/fx/mw.ts)
 * and nothing else — no APP_STR (trmfxapp) and no FxTransaction (fx).
 */
import { txt } from '../../shared/fx/masters.ts'
import { fxAllocate, fxColumns, fxCreate, fxDelete, fxHasFieldRange, fxList, fxUpdate } from '../../shared/fx/mw.ts'
import { sapNow, sapUser } from '../../shared/fx/sap.ts'
import { TCODE } from './data.ts'
import type { Ports } from './workflow.ts'

export const middlewarePorts: Ports = {
  list: (resource, filter = {}) => fxList(resource, filter),
  create: (resource, data) => fxCreate(resource, data),
  update: (resource, key, changes) => fxUpdate(resource, key, changes),
  remove: (resource, key) => fxDelete(resource, key),
  columns: (resource) => fxColumns(resource),
  hasFieldRange: (resource, field) => fxHasFieldRange(resource, field),
  allocate: (resource, key, field) => fxAllocate(resource, key, field),
  now: async () => ({ user: await sapUser(), ...sapNow() }),
}

/**
 * The sellers whose BLs the finalisation stamps: TVARVC rows named after the transaction code
 * (replacing the hard-coded 'OIL' of the original, as save_data's own comment says).
 */
export async function loadFinalisationSellers(): Promise<string[]> {
  const rows = await fxList('tvarvc', { NAME: TCODE })
  return rows.map((r) => txt(r, 'LOW')).filter(Boolean)
}
