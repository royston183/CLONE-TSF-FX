/*
 * Reads and writes behind the FX-Invoice Difference (invoiceDifference.ts has the rules).
 *
 *   read   ZSGTSFTR_INV_REF "invRef", ZSGTSFTR_BIL_ADJ "billAdjustment", ZSGTSFTR_RULE_BT "fxModel", ZSGTSFTR_SET_SPT "setSpt",
 *          ZSGTSFTR_TSF_PAY "tsfPay" (optional: a failed read only leaves out its company / Buy-Sell override), ZSGTSFTR_IN_SPOT "inSpot".
 *   write  ZSGTSFTR_IN_SPOT through the middleware, MODIFY-style: a row whose key (ZMOD_ID, ZDEAL_ID, ZDEAL_TYPE, ZDSS_TYPE)
 *          exists is updated, any other is inserted. No SAP transaction is booked and ZSPOT_TXN / ZSPOT_CREATE stay as they are.
 */
import { txt } from '../../shared/fx/masters.ts'
import { fxCreate, fxList, fxUpdate, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { changedStamp, createdStamp, dec } from '../../shared/fx/sap.ts'
import { ALREADY_SAVED_MESSAGE, SAVED_MESSAGE, computeDifferences, rowsToSave, type DiffInput, type DiffRow, type InSpotRow } from './invoiceDifference.ts'
import type { Deal, FxDeal, TradeInvoice } from './types.ts'

const IN_SPOT = 'inSpot'

export type DifferenceData = Pick<DiffInput, 'invRef' | 'billAdj' | 'rules' | 'setSpt' | 'tsfPay' | 'existing'> & {
  /** Set when an optional table could not be read, so the screen can say what is missing. */
  note: string
}

/** Everything PROCESS_DATA_NEW selects, for one Deal ID and model. */
export async function loadDifferenceData(dealId: string, model: string, signal?: AbortSignal): Promise<DifferenceData> {
  const mod4 = model.slice(0, 4)
  const opts = { signal }
  const [invRef, billAdj, rules, setSpt, existing] = await Promise.all([
    fxList('invRef', { ZDEAL_ID: dealId }, opts),
    fxList('billAdjustment', { ZDEAL_ID: dealId }, opts),
    fxList('fxModel', { ZMOD_ID: mod4 }, opts),
    fxList('setSpt', { ZMOD_ID: mod4 }, opts),
    fxList(IN_SPOT, { ZDEAL_ID: dealId }, opts),
  ])
  let tsfPay: FxRow[] = []
  let note = ''
  try {
    tsfPay = await fxList('tsfPay', { ZMOD_ID: mod4 }, opts)
  } catch (error) {
    if (isAbort(error)) throw error
    note = 'ZSGTSFTR_TSF_PAY could not be read, so the spot company and Buy / Sell come from ZSGTSFTR_SET_SPT only.'
  }
  return { invRef, billAdj, rules, setSpt, tsfPay, existing, note }
}

export type DifferenceView = { rows: DiffRow[]; input: DiffInput; note: string }

/** The difference rows of a Deal ID, with the input they were computed from (the save needs it again). */
export async function loadDifference(deal: Deal, fxDeals: readonly FxDeal[], invoices: readonly TradeInvoice[], signal?: AbortSignal): Promise<DifferenceView> {
  const data = await loadDifferenceData(deal.dealId, deal.fxModelId, signal)
  const input: DiffInput = { model: deal.fxModelId, dealId: deal.dealId, fxDeals, invoices, ...data }
  return { rows: computeDifferences(input), input, note: data.note }
}

export type DifferencePorts = {
  list: (dealId: string) => Promise<FxRow[]>
  create: (row: Record<string, string>) => Promise<void>
  update: (key: Record<string, string>, changes: Record<string, string>) => Promise<void>
}

export const livePorts: DifferencePorts = {
  list: (dealId) => fxList(IN_SPOT, { ZDEAL_ID: dealId }),
  create: async (row) => void (await fxCreate(IN_SPOT, row)),
  update: (key, changes) => fxUpdate(IN_SPOT, key, changes),
}

const keyOf = (r: InSpotRow): Record<string, string> => ({ ZMOD_ID: r.ZMOD_ID, ZDEAL_ID: r.ZDEAL_ID, ZDEAL_TYPE: r.ZDEAL_TYPE, ZDSS_TYPE: r.ZDSS_TYPE })

/** The row as the middleware takes it: the key, the texts, and the amounts with the two decimals the table stores. */
export function toColumns(r: InSpotRow): Record<string, string> {
  return {
    ...keyOf(r),
    ZBUKRS: r.ZBUKRS,
    ZRFHA: r.ZRFHA,
    ZT_TYPE: r.ZT_TYPE,
    ZF_AMT: dec(r.ZF_AMT, 2),
    ZFX_AMT: dec(r.ZFX_AMT, 2),
    ZCURR: r.ZCURR,
    ZD_AMT: dec(r.ZD_AMT, 2),
    ZSBUKRS: r.ZSBUKRS,
    ZBS: r.ZBS,
  }
}

export type SaveResult = { ok: true; message: string; saved: number } | { ok: false; error: string }

/**
 * The SPOT button (SAVE_SPOT_DATA_NEW): MODIFY ZSGTSFTR_IN_SPOT from the difference rows. Re-reads the Deal ID's rows
 * first, so a row saved since the screen opened is not written twice. Nothing to save is the program's information
 * message (TEXT-103), not an error.
 */
export async function saveDifference(view: DifferenceView, ports: DifferencePorts = livePorts): Promise<SaveResult> {
  try {
    const existing = await ports.list(view.input.dealId)
    const input = { ...view.input, existing }
    const rows = rowsToSave(input, computeDifferences(input))
    if (rows.length === 0) return { ok: true, message: ALREADY_SAVED_MESSAGE, saved: 0 }
    const created = await createdStamp()
    const changed = await changedStamp()
    for (const r of rows) {
      const key = keyOf(r)
      const columns = toColumns(r)
      const found = existing.some((e) => (Object.keys(key) as Array<keyof typeof key>).every((k) => txt(e, k) === key[k]))
      if (found) await ports.update(key, { ...columns, ...changed })
      else await ports.create({ ...columns, ...created })
    }
    return { ok: true, message: SAVED_MESSAGE, saved: rows.length }
  } catch (error) {
    return { ok: false, error: `Saving the invoice difference (ZSGTSFTR_IN_SPOT) failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
