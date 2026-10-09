/**
 * MO: Update MC Expiry against the SLC middleware.
 *
 * Mirrors ZSGTSF_RMC_EXPIRY (ZSGTSFR049): Master Contracts come from ZSGTSFTR_MAS_CON, and an
 * expiry — manual rows or "MC View with Expiry Posting" — moves ZMC_STAT 04 (In Use) to 09
 * (Expired), one update per MC.
 *
 * The contracts are read once, whole, and the screen keeps its own Key Date filter (In Use
 * and shipment end on or before the Key Date, logic.ts isEligibleForExpiry). A server-side
 * `ZSHIP_END = <key date>` read would list only the contracts ending on that very day, which
 * is not what this screen shows.
 *
 * What MySQL cannot answer stays as it was: utilization comes from ZSGTSFV_FX, a view over
 * SAP TRM tables that is not in MySQL (so it is 0 and the balance is the MC amount), the
 * status texts are MC_STAT's dummy while that table is empty, and the whole list falls back
 * to the seed rows only when the middleware cannot be reached.
 */
import { listMasterContracts, loadTransactions, setMcStatus, type McRow } from '../../shared/fx/master-contract.ts'
import { txt, type MasterSource } from '../../shared/fx/masters.ts'
import { dmyFromIso, num } from '../../shared/fx/sap.ts'
import { loadMcStatuses, statusText, type McStatusRow } from '../../shared/fx/status.ts'
import { seedContracts } from './data.ts'
import type { MasterContract } from './types.ts'

export const IN_USE = '04'
export const EXPIRED = '09'

/**
 * The texts this screen's logic compares against ('In Use' selects and expires, 'Expired'
 * counts as eligible in the details) stay pinned to their codes, whatever ZSGTSFTR_MC_STAT
 * says once it is migrated. Any other code shows MC_STAT's text.
 */
const STATUS_LABEL: Record<string, string> = {
  [IN_USE]: 'In Use',
  [EXPIRED]: 'Expired',
}

export type Loaded = { contracts: MasterContract[]; source: MasterSource; demoCount: number }

/**
 * Every Master Contract. When the middleware cannot be reached the seed rows stand in for
 * MAS_CON. When it can, the seed rows MAS_CON does not already hold are added alongside, so
 * the screen always has contracts to view and expire. Those demo rows carry no statusCode,
 * so expirableRefs never sends them to MySQL: their expiry stays on the screen.
 */
export async function loadContracts(signal?: AbortSignal): Promise<Loaded> {
  const statuses = (await loadMcStatuses(signal)).rows
  const { rows, source } = await loadTransactions(
    async () => (await listMasterContracts({}, signal)).map((r) => toContract(r, statuses)),
    seedContracts,
    'Master Contracts',
  )
  if (source !== 'mysql') return { contracts: rows, source, demoCount: 0 }
  const demo = withDemoContracts(rows)
  return { contracts: demo, source, demoCount: demo.length - rows.length }
}

/** MAS_CON's rows followed by every seed row whose MC number MAS_CON does not use. */
export function withDemoContracts(rows: readonly MasterContract[]): MasterContract[] {
  const taken = new Set(rows.map((r) => r.mcNumber))
  return [...rows, ...seedContracts().filter((c) => !taken.has(c.mcNumber))]
}

/**
 * A re-read rebuilds the demo rows from the seed, which would undo an expiry made on them
 * this session; the previous on-screen copy of each demo row is kept instead.
 */
export function keepDemoState(previous: readonly MasterContract[], next: readonly MasterContract[]): MasterContract[] {
  const demo = new Map(previous.filter((c) => c.statusCode === undefined).map((c) => [c.mcNumber, c]))
  return next.map((c) => (c.statusCode === undefined ? (demo.get(c.mcNumber) ?? c) : c))
}

export function toContract(r: McRow, statuses: readonly McStatusRow[]): MasterContract {
  const code = txt(r, 'ZMC_STAT')
  const mcAmount = num(r['ZAMT'])
  // Utilized = linked FX deals (ZSGTSFV_FX) + options. ZSGTSFV_FX reads SAP TRM tables and is
  // not in MySQL, so the utilized amount is unavailable: 0 here, and the balance is the full
  // MC amount. MAS_CON's own ZUTI_AMT is not read — nothing in this program is known to fill it.
  const utilization = 0

  return {
    mcNumber: txt(r, 'ZMC_REF_NO'),
    client: txt(r, 'ZORIGIN'),
    // The SAP screenshots show ZMC_DESC ('OSIPL_Multi-Commodity_M041_0.011154M') as the
    // reference. The legacy mock had a separate free-text description, but MAS_CON has no
    // column for one, so the description is ZMC_DESC as well.
    mcReferenceNo: txt(r, 'ZMC_DESC'),
    mcDescription: txt(r, 'ZMC_DESC'),
    mcDate: dmyFromIso(r['ZMC_DATE']),
    seller: txt(r, 'ZSELL'),
    buyer: txt(r, 'ZBUY'),
    originEntity: txt(r, 'ZORIGIN'),
    mcAmount,
    currency: txt(r, 'ZCURR'),
    mcAmountOrigin: num(r['ZORG_AMT']),
    originCurrency: txt(r, 'ZOCURR'),
    exchangeRate: num(r['ZEX_RATE']),
    shipmentStart: dmyFromIso(r['ZSHIP_START']),
    shipmentEnd: dmyFromIso(r['ZSHIP_END']),
    gtCommodity: txt(r, 'ZCOMMODITY'),
    commodity: txt(r, 'ZCOM_DESC'),
    commodityDescription: txt(r, 'ZCOM_DESC_LONG'),
    entityId: txt(r, 'ZENT_ID'),
    entityString: txt(r, 'ZENT_DESC'),
    currencyString: txt(r, 'ZCURR_DESC'),
    paymentTerms: txt(r, 'ZPAY_TERMS'),
    fxModel: txt(r, 'ZMOD_ID'),
    modelDescription: txt(r, 'ZMOD_DESC'),
    portOfShipment: txt(r, 'ZPOS'),
    portOfDestination: txt(r, 'ZPOD'),
    createdMC: dmyFromIso(r['ZMC_DATE']),
    utilization,
    balanceAmount: mcAmount - utilization,
    // "Days Outstanding": the screen never calculated it — the legacy mock carried a fixed
    // number per row — and MAS_CON has no column for it, so it is 0 until its rule is known.
    days: 0,
    moRemarks: txt(r, 'ZMO_REMARKS'),
    foRemarks: txt(r, 'ZFO_REMARKS'),
    enteredBy: txt(r, 'ZCREATED_BY'),
    enteredOn: dmyFromIso(r['ZCREATED_DATE']),
    entryTime: txt(r, 'ZCREATED_TIME'),
    changedBy: txt(r, 'ZCHANGED_BY'),
    changedOn: dmyFromIso(r['ZCHANGED_DATE']),
    changeTime: txt(r, 'ZCHANGED_TIME'),
    status: STATUS_LABEL[code] ?? statusText(statuses, code),
    statusCode: code,
  }
}

/**
 * The MCs an expiry may move: the screen's rule (only In Use expires) as the stored code, so
 * a row the header checkbox picked up at another status is left alone.
 */
export function expirableRefs(contracts: readonly MasterContract[], mcNumbers: readonly string[]): string[] {
  const ids = new Set(mcNumbers)
  return contracts.filter((c) => ids.has(c.mcNumber) && c.statusCode === IN_USE).map((c) => c.mcNumber)
}

/**
 * 04 -> 09 for each listed MC that is In Use, one update per contract. Only ZMC_STAT changes
 * (plus the ZCHANGED_* stamp updateMasterContract adds): the program computes the expiry
 * amount (MC amount - utilized) for display, and MAS_CON has no column that stores it.
 */
export async function expireOnMysql(contracts: readonly MasterContract[], mcNumbers: readonly string[]): Promise<void> {
  await setMcStatus(expirableRefs(contracts, mcNumbers), EXPIRED)
}
