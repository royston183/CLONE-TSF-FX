import { loadMaster, txt, type MasterSource } from './masters.ts'
import { listMasterContracts, messageOf, type DealRow, type McRow } from './master-contract.ts'
import { fxList, fxUpdate, type FxFilter, type FxRow } from './mw.ts'
import { changedStamp } from './sap.ts'

/**
 * The Deal ID reports (ZSGTSF_RDEAL_LIST_CONF, _RDEAL_ID_INV_STAT, _RDEAL_ID_INV_MARK,
 * _RDEAL_INV_LIST) all read the same thing: ZSGTSFTR_DEALID joined to its Master Contract,
 * the MC's origin entity (ZSGTSFTR_COMP, for the region), its FX model (ZSGTSFTR_RULE_BT) and
 * the status text (ZSGTSFTR_DEAL_ST). This module does that join once; each screen maps the
 * result to its own row shape.
 *
 * Utilization is not available: the programs read it from ZSGTSFCDS_FX / ZSGTSFV_FX, and the
 * VTBFHA extract behind them holds no FX deals yet, so every screen shows 0.
 */

/** ZSGTSFTR_DEAL_ST is keyed by deal type + sub type: FX1 forwards, FX2 options. */
export const DEAL_TYPE = 'FX'
export const FORWARD_SUB_TYPE = 'FX1'
export const OPTION_SUB_TYPE = 'FX2'

/** No region master is migrated; COMP carries the code, these are the texts the screens used. */
export const REGION_TEXT: Readonly<Record<string, string>> = {
  R01: 'South-East Asia',
  R02: 'China',
  R03: 'United States of America',
  R04: 'Middle East & Africa',
  R05: 'Europe',
  R06: 'United Kingdom',
  R07: 'Latin America',
  R08: 'Brazil',
  R09: 'Canada',
}

export type DealContext = {
  /** ZSGTSFTR_COMP by ZCOM_ID (the MC's ZORIGIN). */
  comp: ReadonlyMap<string, FxRow>
  /** ZSGTSFTR_RULE_BT by ZMOD_ID, first row of each model. */
  models: ReadonlyMap<string, FxRow>
  /** ZSGTSFTR_DEAL_ST rows. */
  statuses: readonly FxRow[]
  /** ZSGTSFTR_MAS_CON by ZMC_REF_NO. */
  mcs: ReadonlyMap<string, McRow>
  /** Whether the masters came from MySQL; the deals themselves always do, or the load throws. */
  source: MasterSource
}

const byKey = (rows: readonly FxRow[], column: string): Map<string, FxRow> => {
  const map = new Map<string, FxRow>()
  for (const r of rows) {
    const k = txt(r, column)
    if (k && !map.has(k)) map.set(k, r)
  }
  return map
}

/** Deal IDs, newest first. */
export function listDealIds(filter: FxFilter = {}, signal?: AbortSignal): Promise<DealRow[]> {
  return fxList('tsfDealId', filter, { sort: '-ZDEAL_ID', signal })
}

/**
 * Everything the Deal ID rows are joined to. The masters degrade to empty maps when MySQL has
 * none (the screen then shows codes without texts); the MCs are read in full, as the reports'
 * FOR ALL ENTRIES does, since a Deal ID without its MC cannot be shown at all.
 */
export async function loadDealContext(signal?: AbortSignal): Promise<DealContext> {
  const [comp, models, statuses, mcs] = await Promise.all([
    loadMaster('comp', (rows) => rows, [] as FxRow[], { signal }),
    loadMaster('fxModel', (rows) => rows, [] as FxRow[], { signal }),
    fxList('tsfDealStatus', { ZDEAL_TYPE: DEAL_TYPE }, { signal }),
    listMasterContracts({}, signal),
  ])
  return {
    comp: byKey(comp.rows, 'ZCOM_ID'),
    models: byKey(models.rows, 'ZMOD_ID'),
    statuses,
    mcs: byKey(mcs, 'ZMC_REF_NO'),
    source: comp.source === 'mysql' && models.source === 'mysql' ? 'mysql' : 'dummy',
  }
}

/** ZDEAL_SDESC for a status under the deal's sub type (the programs filter DEAL_ST by it). */
export function dealStatusText(ctx: Pick<DealContext, 'statuses'>, subType: string, code: string): string {
  const sub = subType || FORWARD_SUB_TYPE
  const row =
    ctx.statuses.find((s) => txt(s, 'ZSUB_TYPE') === sub && txt(s, 'ZDEAL_STAT') === code) ??
    ctx.statuses.find((s) => txt(s, 'ZDEAL_STAT') === code)
  return row ? txt(row, 'ZDEAL_SDESC') : ''
}

/** The MC, its origin entity's COMP row and its model's RULE_BT row, for one Deal ID. */
export function dealJoin(ctx: DealContext, deal: DealRow): { mc: McRow | undefined; comp: FxRow | undefined; model: FxRow | undefined } {
  const mc = ctx.mcs.get(txt(deal, 'ZMC_REF'))
  const origin = mc ? txt(mc, 'ZORIGIN') : ''
  const modelId = txt(deal, 'ZTSF_MODEL') || (mc ? txt(mc, 'ZMOD_ID') : '')
  return { mc, comp: ctx.comp.get(origin), model: ctx.models.get(modelId) }
}

export const regionText = (code: string): string => REGION_TEXT[code] ?? code

/** ZSGTSFTR_DEALID's key: ZDEAL_ID + ZDEAL_TYPE + ZSUB_TYPE (the client is added by the middleware). */
export function dealKey(deal: DealRow): Record<string, string> {
  return { ZDEAL_ID: txt(deal, 'ZDEAL_ID'), ZDEAL_TYPE: txt(deal, 'ZDEAL_TYPE'), ZSUB_TYPE: txt(deal, 'ZSUB_TYPE') }
}

/**
 * Moves each Deal ID to `status` with the changed-by stamp, one update per deal as the ABAP
 * loops do. Stops at the first failure and says which had already moved.
 */
export async function setDealStatus(deals: readonly DealRow[], status: string): Promise<void> {
  const done: string[] = []
  for (const deal of deals) {
    try {
      await fxUpdate('tsfDealId', dealKey(deal), { ZDEAL_STAT: status, ...(await changedStamp()) })
      done.push(txt(deal, 'ZDEAL_ID'))
    } catch (error) {
      const moved = done.length ? ` (${done.join(', ')} already moved to ${status})` : ''
      throw new Error(`Could not update Deal ID ${txt(deal, 'ZDEAL_ID')}${moved}: ${messageOf(error)}`)
    }
  }
}

export type DealUpdateResult = { dealId: string; ok: boolean; reason?: string }
export type DealUpdateOutcome = { succeeded: string[]; failed: Array<{ dealId: string; reason: string }> }

/**
 * Like setDealStatus, but a failed deal does not stop the rest: every deal is tried and each
 * one's result reported. Setting the same target status twice is harmless, so a retry of the
 * failed ones (or of all) is idempotent. Only ZDEAL_STAT and the changed-by stamp are written.
 */
export async function setDealStatusEach(
  deals: readonly DealRow[],
  status: string,
  write: (key: Record<string, string>, changes: Record<string, unknown>) => Promise<void> = (key, changes) => fxUpdate('tsfDealId', key, changes),
): Promise<DealUpdateOutcome> {
  const out: DealUpdateOutcome = { succeeded: [], failed: [] }
  for (const deal of deals) {
    const dealId = txt(deal, 'ZDEAL_ID')
    try {
      await write(dealKey(deal), { ZDEAL_STAT: status, ...(await changedStamp()) })
      out.succeeded.push(dealId)
    } catch (error) {
      out.failed.push({ dealId, reason: messageOf(error) })
    }
  }
  return out
}
