/*
 * SAP data for ZSGTSFR033 "Generate Invoices" (ZSGTSF_RBILL_ADJUST — Amend Selected BLs and
 * Finalise Trade Invoices), read through the SLC middleware exactly as the ABAP reads it.
 * Nothing falls back to sample data.
 *
 *   P_DEAL / View Deals  matchcode ZSGTSFSH_DEAL_ID (body not in the export) -> ZSGTSFTR_DEALID, with
 *                        the MC (ZSGTSFTR_MAS_CON) for model / entity string and DEAL_ST for the status
 *   Header (9000)        FORM screen_desc_fields: ZSGTSFTR_DEALID ⋈ MAS_CON (zmc_ref) ⋈ RULE_BT (MC zmod_id)
 *                        ⋈ ZSGTRMTR_TRADER (ztcode = ztrd_code) — INNER JOINs: no row, no header
 *   Deal ID Status       FORM drop_down: ZSGTSFTR_DEAL_ST, FX1 / FX2 by ZTSF_MODEL (invoice.ts statusList)
 *   FX Deals (GV_CONT1)  FORM deal_detals: ZSGTSFCDS_FX + ZSGTSFCDS_OPTION WHERE ztsf_deal_id AND saktiv <> 3
 *                        -> ZSGTSFTR_APP_STR (TrmFxApp, by ZTSF_DEAL_ID) joined to the standard FxTransaction
 *                        on BUKRS + RFHA (transactions.ts), READ ONLY. No standard Option service exists:
 *                        an FX2 model says WAITING FOR API (OPTION_SERVICE_MISSING).
 *   Adjusted Price/Qty   FORM invoice_plan (invoice.ts): ZSGTSFTR_BL / BL_RUSE, INV_REF, BIL_ADJ, ENT_STR,
 *                        CUR_STR, RULE_BT, COMP, ORG_PRO, TVARVC — priced from gt_top, so it waits with it
 *   Tolerance            ZSGTSFTR_TOLR ztol_id 'T02'
 *   View BLs (9001)      ZSGTSFTR_BL WHERE zdeal_id; ZSGTSFTR_BL_RUSE WHERE zdeal_id AND zreuse_conf = ''
 *   Invoice Diff (9004)  FORM fetch_invoice_diff: INV_REF, BIL_ADJ, RULE_BT(gv_mod); deal amounts from gt_top
 *   House bank           T012 / T012K ⋈ COMP -> HouseBankAccount (shared/fx/house-bank.ts)
 *   Partner bank         BUT0BK of the FX deal's partner -> SlcTsfBpBank (shared/fx/partner-bank.ts)
 *
 * Writes (each reproduces the ABAP's own Z-table statement; none writes APP_STR or a Treasury transaction):
 *   SAVE      FORM save_initial_data  MODIFY zsgtsftr_bil_adj (unconfirmed rows, created stamp)
 *   AMDC      FORM save_alv2_data     MODIFY zsgtsftr_bil_adj (rows already saved; a new row needs
 *                                     NUMBER_GET_NEXT ZSGTSFNR08 -> WAITING FOR ACTION API)
 *   C_UPD     FORM calcuate_update_invoice  UPDATE zsgtsftr_bil_adj / zsgtsftr_inv_ref
 *   AMD_DEAL  FORM ammend_deal        UPDATE zsgtsftr_dealid (zdeal_stat) + UPDATE zsgtsftr_bil_adj FROM TABLE
 *   Confirm Invoice, Reverse Confirm, BL De-assign, Amend Deal Status: workflow.ts (step-by-step, resumable).
 *   Still without a backend: letters (Adobe Form), e-mail, Premium Adjustment, Option transactions.
 */
import { txt } from '../../shared/fx/masters.ts'
import { fxAllocate, fxCreate, fxDelete, fxHasFieldRange, fxList, fxUpdate, isAbort, type FxRow as MwRow } from '../../shared/fx/mw.ts'
import { dec, dmyFromIso, isoFromDmy, num, sapNow, sapUser } from '../../shared/fx/sap.ts'
import { TCODE } from './data.ts'
import {
  buildInvoiceRows,
  dats,
  invoiceDifference,
  modelWithCurrency,
  rollDealTypes,
  round,
  statusList,
  type StatusOption,
} from './invoice.ts'
import { pcForStatus, toggledStatus } from './invoice-status.ts'
import { OPTION_SERVICE_MISSING, loadDealTransactions } from './transactions.ts'
import type { AdjRecord, BlRow, Deal, DealListRow, FxRow, InvRow } from './types.ts'

export const WAITING = 'WAITING FOR API'
export const WAITING_ACTION = 'WAITING FOR ACTION API'

export const invWaitingReason = (fxReason: string) =>
  `${WAITING} — Adjusted Price / Qty is priced from the deal's FX transactions (FORM invoice_plan reads gt_top for rates, due date and business partner). ${fxReason.replace(`${WAITING} — `, '')}`

/** Shown on the bank popup when the Partner Bank list (SlcTsfBpBank, BUT0BK of the deal's partner) could not be read. */
export const BANK_WAITING = `Partner Bank could not be read from SlcTsfBpBank (BUT0BK of the FX deal's partner). House Bank / Account ID are read from HouseBankAccount (the seller's company code).`

export const actionWaiting = (what: string, apis: string) => `${WAITING_ACTION} — ${what} (${apis}) has no API yet. Nothing was posted to SAP.`

const first = (rows: readonly MwRow[], column: string, value: string) => rows.find((r) => txt(r, column) === value)

/* ------------------------------------------------------------------ pure mappings */

/** The header's INNER JOIN chain; undefined when any link is missing (SELECT SINGLE fails). */
export function headerJoin(deal: MwRow | undefined, mcs: readonly MwRow[], rules: readonly MwRow[], traders: readonly MwRow[]) {
  if (!deal) return undefined
  const mc = first(mcs, 'ZMC_REF_NO', txt(deal, 'ZMC_REF'))
  if (!mc) return undefined
  const rule = first(rules, 'ZMOD_ID', txt(mc, 'ZMOD_ID'))
  if (!rule) return undefined
  const trader = first(traders, 'ZTCODE', txt(deal, 'ZTRD_CODE'))
  if (!trader) return undefined
  return { deal, mc, rule, trader }
}

/** One Deal ID of the value help / View Deals list. */
export function dealListRow(d: MwRow, mc: MwRow | undefined, statuses: readonly MwRow[]): DealListRow {
  const status = txt(d, 'ZDEAL_STAT')
  const label = statusList(statuses, txt(d, 'ZTSF_MODEL')).find((o) => o.key === status)?.text ?? status
  return {
    dealId: txt(d, 'ZDEAL_ID'),
    dealRef: txt(d, 'ZDEAL_REF'),
    modelId: mc ? modelWithCurrency(txt(mc, 'ZMOD_ID'), txt(d, 'ZDEAL_CURR_ID')) : '',
    entityString: mc ? txt(mc, 'ZENT_DESC') : '',
    status,
    statusLabel: label,
    mcRef: txt(d, 'ZMC_REF'),
    trader: txt(d, 'ZTRD_CODE'),
  }
}

/** One ZSGTSFTR_BL / _BL_RUSE row as screen 9001 shows it. */
export function blFromRow(r: MwRow): BlRow {
  const statId = txt(r, 'ZBL_STAT_ID')
  const stat = txt(r, 'ZBL_STAT')
  return {
    blNo: txt(r, 'ZBL_NO'),
    blSplit: txt(r, 'ZBL_SPLIT'),
    blDate: dmyFromIso(txt(r, 'ZBL_DATE')),
    lot: txt(r, 'ZBL_LOT'),
    tfNo: txt(r, 'ZTF_NO'),
    tfSplit: txt(r, 'ZTF_SPLIT'),
    vessel: txt(r, 'ZBL_VSSL_NAME'),
    pol: txt(r, 'ZPOL'),
    pod: txt(r, 'ZPOD'),
    commodity: txt(r, 'ZCMMD'),
    qty: num(r['ZQUANTITY']),
    status: stat ? `${statId} - ${stat}` : statId,
    invType: txt(r, 'ZINV_TYPE'),
    invDate: dmyFromIso(txt(r, 'ZINV_DATE')),
    reuse: txt(r, 'ZBL_REUSE'),
    locked: txt(r, 'ZINV_TYPE') !== '',
  }
}

/** The BLs of a deal: ZSGTSFTR_BL, then ZSGTSFTR_BL_RUSE rows not yet confirmed (zreuse_conf = ''). */
export function dealBls(bl: readonly MwRow[], reuse: readonly MwRow[]): MwRow[] {
  return [...bl, ...reuse.filter((r) => txt(r, 'ZREUSE_CONF') === '')]
}

/* ------------------------------------------------------------------ reads */

export type Loaded<T> = { ok: true; value: T } | { ok: false; reason: string }

const failure = (what: string, error: unknown): { ok: false; reason: string } => {
  if (isAbort(error)) throw error
  console.warn(`[generate-invoices] ${what} unavailable`, error)
  return { ok: false, reason: `${what} could not be read from SAP.` }
}

/** The Deal IDs P_DEAL / GV_DEAL offer (ZSGTSFTR_DEALID, newest first). */
export async function loadDealList(signal?: AbortSignal): Promise<Loaded<DealListRow[]>> {
  try {
    const [deals, mcs, statuses] = await Promise.all([
      fxList('tsfDealId', {}, { sort: '-ZDEAL_ID', signal }),
      fxList('masterContract', {}, { signal }),
      fxList('tsfDealStatus', {}, { signal }),
    ])
    const seen = new Set<string>()
    const rows = deals
      .filter((d) => !seen.has(txt(d, 'ZDEAL_ID')) && !!seen.add(txt(d, 'ZDEAL_ID')))
      .map((d) => dealListRow(d, first(mcs, 'ZMC_REF_NO', txt(d, 'ZMC_REF')), statuses))
    return { ok: true, value: rows }
  } catch (error) {
    return failure('Deal IDs (ZSGTSFTR_DEALID)', error)
  }
}

/** Everything the write paths need beyond the displayed Deal. */
export type DealContext = {
  dealRows: MwRow[]
  bilAdj: MwRow[]
  invRef: MwRow[]
  /** RULE_BT of the MC's model (invoice_plan's ls_zsgtsftr_rule_bt). */
  rule: MwRow | undefined
  /** RULE_BT of the model with its currency suffix (fetch_invoice_diff's gv_mod). */
  diffRule: MwRow | undefined
  /** The raw BL rows behind Deal.bl, index for index (gt_data): ZSGTSFTR_BL, then unconfirmed ZSGTSFTR_BL_RUSE. */
  bls: MwRow[]
  /** The ZSGTSFTR_BL_RUSE rows read for the Deal ID (confirmed ones too), to tell a reuse BL from a normal one. */
  blReuse: MwRow[]
}

export type LoadedDeal = { deal: Deal; statusOptions: StatusOption[]; ctx: DealContext; notice: string }

const today = (): string => dats(sapNow().date)

/**
 * GET_DATA for one Deal ID. The FX transactions are checked first: without them gt_inv cannot
 * be priced, so the grids say WAITING FOR API rather than showing numbers SAP would not.
 */
export async function loadDeal(dealId: string, signal?: AbortSignal): Promise<LoadedDeal> {
  const o = { signal }
  const [dealRows, statuses, blRows, reuseRows, tolRows, bilAdj, invRef] = await Promise.all([
    fxList('tsfDealId', { ZDEAL_ID: dealId }, o),
    fxList('tsfDealStatus', {}, o),
    fxList('billOfLading', { ZDEAL_ID: dealId }, o).then(
      (v) => ({ ok: true as const, v }),
      (e) => failure('ZSGTSFTR_BL', e),
    ),
    fxList('blReuse', { ZDEAL_ID: dealId }, o).then(
      (v) => ({ ok: true as const, v }),
      (e) => failure('ZSGTSFTR_BL_RUSE', e),
    ),
    fxList('tolerance', { ZTOL_ID: 'T02' }, o).catch((e) => (failure('ZSGTSFTR_TOLR', e), null)),
    fxList('billAdjustment', { ZDEAL_ID: dealId }, { ...o, sort: 'ZINV_REF' }),
    fxList('invRef', { ZDEAL_ID: dealId }, { ...o, sort: 'ZINV_TRM_NO' }),
  ])
  const d = dealRows[0]
  const notices: string[] = []

  const mcs = d && txt(d, 'ZMC_REF') ? await fxList('masterContract', { ZMC_REF_NO: txt(d, 'ZMC_REF') }, o) : []
  const mc = mcs[0]
  const rules = mc && txt(mc, 'ZMOD_ID') ? await fxList('fxModel', { ZMOD_ID: txt(mc, 'ZMOD_ID') }, o) : []
  const traders = d ? (await fxList('trmTrader', {}, o)).filter((t) => txt(t, 'ZTCODE') === txt(d, 'ZTRD_CODE')) : []
  const head = headerJoin(d, mcs, rules, traders)
  if (d && !head) notices.push(`Deal ID ${dealId}: ZSGTSFTR_DEALID ⋈ ZSGTSFTR_MAS_CON ⋈ ZSGTSFTR_RULE_BT ⋈ ZSGTRMTR_TRADER returned no row, so the header stays empty (as in SAP).`)

  const model = head ? modelWithCurrency(txt(head.mc, 'ZMOD_ID'), txt(head.deal, 'ZDEAL_CURR_ID')) : ''
  const statusOptions = statusList(statuses, d ? txt(d, 'ZTSF_MODEL') : '')

  // FX deals: APP_STR (ZTSF_DEAL_ID) + the standard FxTransaction on BUKRS + RFHA; an option model has no service.
  const comp = await fxList('comp', {}, o)
  const entityOf = (bukrs: string) => txt(first(comp, 'ZBUKRS', bukrs) ?? {}, 'ZCOM_ID')
  let fx: FxRow[] = []
  let fxReason = ''
  try {
    if (head && txt(head.rule, 'ZSUB_TYPE') !== 'FX1') fxReason = OPTION_SERVICE_MISSING
    else fx = rollDealTypes(await loadDealTransactions(dealId, entityOf, signal))
  } catch (error) {
    fxReason = failure('Treasury transactions (ZSGTSFTR_APP_STR / FxTransaction)', error).reason
  }

  const bls = blRows.ok && reuseRows.ok ? dealBls(blRows.v, reuseRows.v) : []
  const blReason = !blRows.ok ? blRows.reason : !reuseRows.ok ? reuseRows.reason : ''

  // gt_inv: only when gt_top is there (and a header, since invoice_plan needs gv_omc).
  let inv: InvRow[] = []
  let invReason = ''
  let region = ''
  let profitMaintained = false
  const rule = rules[0]
  if (fxReason) invReason = invWaitingReason(fxReason)
  else if (head) {
    const [entStr, curStr, orgPro, tvarvc, modelRules] = await Promise.all([
      txt(head.mc, 'ZENT_ID') ? fxList('entityString', { ZENT_ID: txt(head.mc, 'ZENT_ID') }, o) : Promise.resolve([]),
      txt(head.deal, 'ZDEAL_CURR_ID') ? fxList('curStr', { ZCURR_ID: txt(head.deal, 'ZDEAL_CURR_ID') }, o) : Promise.resolve([]),
      fxList('orgPro', { ZCOM_ID: txt(head.mc, 'ZORIGIN') }, o),
      fxList('tvarvc', { NAME: `${TCODE}_MOD` }, o),
      fxList('fxModel', { ZMOD_ID: model }, o),
    ])
    const modelRule = modelRules[0]
    region = modelRule ? txt(first(comp, 'ZCOM_ID', txt(modelRule, 'ZORIGIN')) ?? {}, 'ZREG_ID') : ''
    const built = buildInvoiceRows({
      dealId,
      dm: txt(head.deal, 'ZDM') === 'X',
      zrfha1: txt(head.deal, 'ZRFHA1'),
      zrfha2: txt(head.deal, 'ZRFHA2'),
      model,
      region,
      rule,
      entStr: entStr[0],
      curStr: curStr[0],
      invRef,
      bilAdj,
      orgPro,
      profitModel: tvarvc.some((r) => txt(r, 'LOW') === model),
      bls,
      top: fx,
      premiumRate: null,
      today: today(),
    })
    inv = built.rows
    profitMaintained = built.profitMaintained
  }

  const diffRule = model ? (await fxList('fxModel', { ZMOD_ID: model }, o))[0] : undefined
  const tol = tolRows && tolRows[0] ? num(tolRows[0]['ZTOL_PER']) : null
  if (tolRows === null) notices.push('Tolerance (ZSGTSFTR_TOLR T02) could not be read.')

  const deal: Deal = {
    dealId,
    dealRef: head ? txt(head.deal, 'ZDEAL_REF') : '',
    mcRef: head ? txt(head.mc, 'ZMC_REF_NO') : '',
    mcDesc: head ? txt(head.mc, 'ZMC_DESC') : '',
    modelId: model,
    modelDesc: head ? txt(head.mc, 'ZMOD_DESC') : '',
    entityString: head ? txt(head.mc, 'ZENT_DESC') : '',
    currencyString: head ? txt(head.deal, 'ZDEAL_CURR_DESC') : '',
    trader: head ? txt(head.deal, 'ZTRD_CODE') : '',
    traderDesc: head ? txt(head.trader, 'ZTRADER') : '',
    status: head ? txt(head.deal, 'ZDEAL_STAT') : '',
    fxInvModel: head ? txt(head.deal, 'ZFX_INV_MODEL') : '',
    dealStart: head ? dmyFromIso(txt(head.deal, 'ZS_DATE')) : '',
    dealEnd: head ? dmyFromIso(txt(head.deal, 'ZE_DATE')) : '',
    mcDate: head ? dmyFromIso(txt(head.mc, 'ZMC_DATE')) : '',
    shipStart: head ? dmyFromIso(txt(head.mc, 'ZSHIP_START')) : '',
    shipEnd: head ? dmyFromIso(txt(head.mc, 'ZSHIP_END')) : '',
    dm: head ? txt(head.deal, 'ZDM') === 'X' : false,
    tolerance: tol,
    fx,
    inv,
    bl: bls.map(blFromRow),
    diff: invoiceDifference(invRef, bilAdj, diffRule, fxReason ? null : fx),
    fxReason,
    invReason,
    blReason,
    region,
    profitMaintained,
  }
  return { deal, statusOptions, ctx: { dealRows, bilAdj, invRef, rule, diffRule, bls, blReuse: reuseRows.ok ? reuseRows.v : [] }, notice: notices.join(' ') }
}

/* ------------------------------------------------------------------ writes */

/** Decimals of the ZSGTSFTR_BIL_ADJ DECIMAL columns, as the middleware registers them. */
const ADJ_SCALE: Readonly<Record<string, number>> = {
  ZQTY: 3, ZPRICE: 4, ZUSD_PRICE: 4, ZAMT_USD: 2, ZDIFF_AMT: 2, ZAMT: 2, ZRATE: 7, ZPRATE: 7,
  ZPRE_DISCOUNT: 4, ZNET_AMOUNT: 4, ZPROFIT_MARGIN: 4, ZRISK_AMT: 2,
}
export const ADJ_KEY = ['ZDEAL_ID', 'ZINV_REF', 'ZINV_TYPE', 'ZPRE_T_REF'] as const

/** gs_inv -> the ZSGTSFTR_BIL_ADJ record (CORRESPONDING), with the grid's edited cells. */
export function adjRecordOf(row: InvRow, dealId: string): AdjRecord {
  return {
    ...row.rec,
    ZDEAL_ID: dealId,
    ZINV_DATE: isoFromDmy(row.invDate),
    ZDUE_DATE: isoFromDmy(row.dueDate),
    ZQTY: row.qty,
    ZUSD_PRICE: row.usdPrice,
    ZRATE: row.rate,
    ZPRICE: row.price,
    ZAMT: row.amt,
    ZAMT_USD: row.amtUsd,
    ZHBKID: row.houseBank,
    ZHKTID: row.accountId,
    ZPTNR_BKID: row.partnerBank,
  }
}

/** The record as the middleware accepts it: DECIMALs at their scale, blank dates as null. */
export function toWire(rec: AdjRecord): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {}
  for (const [c, v] of Object.entries(rec)) {
    if (c in ADJ_SCALE) out[c] = dec(Number(v ?? 0), ADJ_SCALE[c]!)
    else if (c === 'ZCOUNT') out[c] = Number(v ?? 0)
    else out[c] = v === '' && /_DATE$|_PDATE$/.test(c) ? null : v
  }
  return out
}

const adjKey = (rec: AdjRecord) => Object.fromEntries(ADJ_KEY.map((k) => [k, String(rec[k] ?? '')]))
const sameKey = (a: AdjRecord, b: MwRow) => ADJ_KEY.every((k) => String(a[k] ?? '') === txt(b, k))

/** MODIFY zsgtsftr_bil_adj FROM wa: update the row when its key exists, insert it otherwise. */
async function modifyAdj(rec: AdjRecord, existing: readonly MwRow[]): Promise<void> {
  const wire = toWire(rec)
  if (existing.some((b) => sameKey(rec, b))) await fxUpdate('billAdjustment', adjKey(rec), wire)
  else await fxCreate('billAdjustment', wire)
}

const audit = async (prefix: 'ZCREATED' | 'ZCHANGED') => {
  const { date, time } = sapNow()
  return { [`${prefix}_BY`]: await sapUser(), [`${prefix}_DATE`]: date, [`${prefix}_TIME`]: time }
}

/** FORM save_initial_data: rows with cinv_type initial, deal ID + USD price + created stamp. */
export function initialRecords(rows: readonly InvRow[], dealId: string, stamp: AdjRecord): AdjRecord[] {
  return rows.filter((r) => !r.locked).map((r) => ({ ...adjRecordOf(r, dealId), ...stamp }))
}

export async function saveInitialData(deal: Deal, ctx: DealContext): Promise<number> {
  const recs = initialRecords(deal.inv, deal.dealId, await audit('ZCREATED'))
  for (const rec of recs) await modifyAdj(rec, ctx.bilAdj)
  return recs.length
}

/**
 * FORM save_alv2_data: every row keeps its saved ZINV_NO / ZPC / created stamp, gets the changed
 * stamp and ZAMDT_CHECK = 'X'. A row without a saved one draws ZINV_NO from NUMBER_GET_NEXT
 * ZSGTSFNR08 — returned as `needsNumber` so the caller refuses the whole MODIFY.
 */
export function amendmentRecords(
  rows: readonly InvRow[],
  dealId: string,
  saved: readonly MwRow[],
  changed: AdjRecord,
  /** Fields a row without a saved one gets besides the changed stamp: ZPC for the current Deal status, the created stamp. */
  fresh: AdjRecord = {},
): { recs: AdjRecord[]; needsNumber: boolean } {
  let needsNumber = false
  const recs = rows.map((r) => {
    const rec = adjRecordOf(r, dealId)
    const s = saved.find((b) => txt(b, 'ZDEAL_ID') === dealId && txt(b, 'ZINV_REF') === rec['ZINV_REF'] && txt(b, 'ZINV_TYPE') === rec['ZINV_TYPE'])
    if (!s) needsNumber = true
    return {
      ...rec,
      ...(s
        ? { ZINV_NO: txt(s, 'ZINV_NO'), ZPC: txt(s, 'ZPC'), ZCREATED_BY: txt(s, 'ZCREATED_BY'), ZCREATED_DATE: s['ZCREATED_DATE'] ?? null, ZCREATED_TIME: txt(s, 'ZCREATED_TIME') }
        : fresh),
      ...changed,
      ZAMDT_CHECK: 'X',
    }
  })
  return { recs, needsNumber }
}

/**
 * FORM save_alv2_data. A row with no saved ZSGTSFTR_BIL_ADJ row is new: it takes its ZINV_NO from the
 * field number range (ZSGTSFNR08/01) when the middleware has one bound to that column and ZPC from the current
 * Deal ID status; with no number range nothing at all is written ('needsNumber').
 */
export async function confirmAmendment(deal: Deal, ctx: DealContext): Promise<'done' | 'needsNumber'> {
  const stamp = await audit('ZCHANGED')
  const created = await audit('ZCREATED')
  const { recs, needsNumber } = amendmentRecords(deal.inv, deal.dealId, ctx.bilAdj, stamp, { ZPC: pcForStatus(deal.status), ...created })
  if (needsNumber && !(await fxHasFieldRange('billAdjustment', 'ZINV_NO'))) return 'needsNumber'
  for (const rec of recs) {
    if (ctx.bilAdj.some((b) => sameKey(rec, b))) await fxUpdate('billAdjustment', adjKey(rec), toWire(rec))
    else {
      // ZINV_NO is a field range (ZSGTSFNR08/01): an insert leaves it blank, so the row goes in
      // first and the number is drawn into it. A failed draw removes the row again.
      await fxCreate('billAdjustment', toWire({ ...rec, ZINV_NO: '' }))
      let drawn: string | undefined
      try {
        drawn = await fxAllocate('billAdjustment', adjKey(rec), 'ZINV_NO')
      } catch (error) {
        await fxDelete('billAdjustment', adjKey(rec))
        throw error
      }
      if (!drawn) {
        await fxDelete('billAdjustment', adjKey(rec))
        throw new Error('The middleware drew no invoice number (ZSGTSFNR08), so the new invoice row was not kept.')
      }
    }
  }
  return 'done'
}

export type RecalcWrite =
  | { table: 'billAdjustment'; key: Record<string, string>; changes: Record<string, string | null> }
  | { table: 'invRef'; key: Record<string, string>; changes: Record<string, string> }

/**
 * FORM calcuate_update_invoice: for each row whose FX deal (zdtype) is in gt_top, ZRATE = ZPRATE =
 * its all-in rate and ZDUE_DATE = its end date on every BIL_ADJ row of deal + ref + type; and
 * ZINV_REF's ZAMT / ZINV_AMT / ZEX_RATE on the ref's INV_REF row of the same zdtype. lv_amt1 /
 * lv_amt2 are not cleared between rows, as in the ABAP.
 */
export function recalcWrites(deal: Deal, ctx: DealContext): RecalcWrite[] {
  const out: RecalcWrite[] = []
  let amt1 = 0
  let amt2 = 0
  for (const r of deal.inv) {
    const top = deal.fx.find((t) => t.dealType === r.dealType)
    if (!top) continue
    const ref = String(r.rec['ZINV_REF'] ?? '')
    if (r.curr === top.curr1) {
      amt1 = Math.abs(top.amt2)
      amt2 = Math.abs(top.amt1)
    } else if (r.curr === top.curr2) {
      amt1 = Math.abs(top.amt1)
      amt2 = Math.abs(top.amt2)
    }
    for (const b of ctx.bilAdj.filter((x) => txt(x, 'ZINV_REF') === ref && txt(x, 'ZINV_TYPE') === r.invType)) {
      out.push({
        table: 'billAdjustment',
        key: Object.fromEntries(ADJ_KEY.map((k) => [k, txt(b, k)])),
        changes: { ZRATE: dec(round(top.allIn, 4), 7), ZDUE_DATE: isoFromDmy(top.end), ZPRATE: dec(round(top.allIn, 4), 7) },
      })
    }
    for (const i of ctx.invRef.filter((x) => txt(x, 'ZINV_TRM_NO') === ref && txt(x, 'ZDTYPE') === r.dealType)) {
      out.push({
        table: 'invRef',
        key: { ZDEAL_ID: txt(i, 'ZDEAL_ID'), ZINV_TRM_NO: txt(i, 'ZINV_TRM_NO') },
        changes: { ZAMT: dec(amt1, 2), ZINV_AMT: dec(amt2, 2), ZEX_RATE: dec(round(top.allIn, 4), 7) },
      })
    }
  }
  return out
}

export async function recalculateAndUpdate(deal: Deal, ctx: DealContext): Promise<number> {
  const writes = recalcWrites(deal, ctx)
  for (const w of writes) await fxUpdate(w.table, w.key, w.changes)
  return writes.length
}

/** FORM ammend_deal: 05 <-> 07; anything else is refused (MESSAGE i052). */
export const amendedStatus = (status: string): string | null => toggledStatus(status)

/**
 * FORM ammend_deal's UPDATE zsgtsftr_bil_adj FROM TABLE lt_update_zpc: each row rebuilt from
 * the fields the ABAP copies, ZPC = 'C' (now 05) / 'P' (now 07). The ABAP does not copy
 * ZINV_DATE, ZPRE_T_REF or the created / changed stamps into lt_update_zpc, so the UPDATE writes
 * them initial; only rows with a blank ZPRE_T_REF match its key.
 */
export function amendDealWrites(newStatus: string, bilAdj: readonly MwRow[]): Array<{ key: Record<string, string>; changes: Record<string, string | null> }> {
  const pc = pcForStatus(newStatus)
  return bilAdj
    .filter((b) => txt(b, 'ZPRE_T_REF') === '')
    .map((b) => ({
      key: Object.fromEntries(ADJ_KEY.map((k) => [k, txt(b, k)])),
      changes: {
        ZPC: pc,
        ZINV_DATE: null,
        ZCREATED_BY: '',
        ZCREATED_DATE: null,
        ZCREATED_TIME: '00:00:00',
        ZCHANGED_BY: '',
        ZCHANGED_DATE: null,
        ZCHANGED_TIME: '00:00:00',
      },
    }))
}

/** A middleware error's message for a toast. */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))
