/**
 * MO: Execute Settlement for Deal ID (Single Deal ID) — ZSGTSFR060 / ZSGTSF_RDEAL_TRD_INV,
 * against the SLC middleware.
 *
 * NOTES ONLY: the ABAP source is not exported. The program is known only from its dependency
 * note (scratchpad/bo/tracker/ABAP_Program_Dependency_Tracker_All/"deal trade invoice.txt"),
 * which lists tables, fields and BAPIs/FMs but NOT the WHERE clauses or in-program filters.
 * So only reads keyed by the Deal ID the user enters are made (source: dependency note
 * "deal trade invoice.txt"; WHERE not exported):
 *
 *   Header            ZSGTSFTR_DEALID   WHERE zdeal_id = P_DEAL          middleware "tsfDealId"
 *   MC context        ZSGTSFTR_MAS_CON  by key ZMC_REF_NO = deal ZMC_REF "masterContract"
 *                     (ZMC_DESC, ZMC_DATE, ZSHIP_END, ZENT_DESC, ZMOD_ID, ZMOD_DESC)
 *   Model flag        ZSGTSFTR_RULE_BT  by key ZMOD_ID = MC ZMOD_ID (ZNO_INV)     "fxModel"
 *   Trader            ZSGTRMTR_TRADER   by key ZTCODE = deal ZTRD_CODE (ZTRADER)  "trmTrader"
 *   Status text/list  ZSGTSFTR_DEAL_ST  by key prefix ZDEAL_TYPE + ZSUB_TYPE of the deal
 *                                                                        "tsfDealStatus"
 *   Deal ID picker    ZSGTSFTR_DEALID, unrestricted (as mo-confirm-fx-deal-id does): the P_DEAL
 *                     search help is not exported.
 *
 * FX Deal Settlement grid    the FX legs are the transactions carrying this Deal ID: TrmFxApp rows with
 *                            ZtsfDealID = P_DEAL (ZSGTSFTR_APP_STR, service "trmfxapp"), each joined on
 *                            CompanyCode + FinancialTransaction with its FxTransaction (service "fx");
 *                            reversed deals (ActiveStatus 3) are left out. Seq, Deal Type and MC Ref are
 *                            APP_STR's; counterparty, dates, currencies, amounts and rates are SAP's.
 *
 * Gated:
 *   FX leg columns with no source: Entity (ZSGTSFTR_COMP name), Doc No 1/2 (BKPF documents) stay blank;
 *   Status is TXN_STATUS, and the settled flag (ZSGTSFTR_TRD_POS ZSET_CHECK) is not served, so no leg
 *   shows as settled. ZSGTSFCDS_OPTION (option legs) has no service -> WAITING FOR API.
 *   Trade Invoice grid       ZSGTSFTR_TRD_POS has no middleware resource ("tradePosition" is
 *                            ZSGSLCTR_TRD_POS, the SLC table) and its default rows come from
 *                            ZSGTSFTR_SET_TYP by a selection that is not exported.
 *   Headsup, DMS list, View Trade Invoice, P&L, FX-Invoice Difference, bank / transfer / DMS
 *   type value helps -> WAITING FOR API.
 *   Every action except Save Spot Data -> WAITING FOR ACTION API. Save Spot Data books the Spot through the
 *   Additional Spot Booking flow (standard FxTransaction + APP_STR + IN_SPOT ZSPOT_TXN/ZSPOT_CREATE); the
 *   entered rate is not stored in IN_SPOT. Its default rate is TCURR (type M, today).
 *
 * Nothing falls back to sample data (the legacy seeds live in fixtures.ts, for tests only).
 */
import { dealStatusText, listDealIds } from '../../shared/fx/deal-id.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { odataString } from '@slc/api-client'
import { loadFxWithApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { getExchangeRate, type GetExchangeRate } from '../../shared/fx/exchange-rate.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { dmyFromIso, isoFromDate } from '../../shared/fx/sap.ts'
import { createAdditionalSpot, defaultTradeDate, type SpotPorts } from '../fo-additional-spot-booking/spotCreate.ts'
import { spotPorts } from '../fo-additional-spot-booking/spotPorts.ts'
import { toSpotRow } from '../fo-additional-spot-booking/spotList.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { statusClass } from './logic.ts'
import type { Deal, FxDeal, StatusMeta } from './types.ts'

export const WAITING = 'WAITING FOR API'
export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'
const PROGRAM = 'ZSGTSF_RDEAL_TRD_INV'
const NOT_EXPORTED = `${PROGRAM} source not exported (only dependency notes)`

export const OPTION_LEGS_WAITING = `${WAITING} — ZSGTSFCDS_OPTION (option legs) has no service; only the FX legs are shown.`

/** What sits under the FX Deal Settlement grid (and the P&L / difference popups) once the FX legs were read. */
export function legsWaitingReason(rows: number): string {
  return rows ? OPTION_LEGS_WAITING : `No FX transaction carries this Deal ID in ZSGTSFTR_APP_STR / FxTransaction. ${OPTION_LEGS_WAITING}`
}

export const legsUnavailable = (why: string): string =>
  `${WAITING} — ZSGTSFTR_APP_STR (service "trmfxapp") or FxTransaction (service "fx") could not be read: ${why}. ZSGTSFCDS_OPTION (option legs) has no service.`

const num = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const rate = (v: unknown): string => (v === undefined || v === null || v === '' ? '' : num(v).toFixed(4))

/**
 * An FX leg as a grid row. Leg 1 is the lead currency (FxTransaction's LeadCurrency), B/S is from the
 * transaction's own buy side, amounts are absolute. Entity and the FI document numbers have no source.
 */
export function toFxDeal({ fx, app }: FxWithApp): FxDeal {
  const type = (app.ZtsfDealType ?? '').trim()
  const lead = fx.LeadCurrency || fx.BuyCurrency || ''
  const follow = fx.FollowCurrency || fx.SellCurrency || ''
  const buysLead = fx.BuyCurrency === lead
  const status = (app.TxnStatus ?? '').trim()
  return {
    seq: (app.ZtsfDealSq ?? '').trim(),
    dealType: type,
    dealTypeChip: type === 'D1' ? 'chip-d1' : type === 'D2' ? 'chip-d2' : 'chip-t',
    rfha: fx.FinancialTransaction,
    bukrs: fx.CompanyCode,
    bp: fx.Partner,
    txnDate: dmyFromIso(fx.ContractDate),
    valDate: dmyFromIso(fx.ValueDate),
    entity: '',
    bs1: buysLead ? 'Buy' : 'Sell',
    curr1: lead,
    amt1: Math.abs(num(buysLead ? fx.BuyAmount : fx.SellAmount)),
    bs2: buysLead ? 'Sell' : 'Buy',
    curr2: follow,
    amt2: Math.abs(num(buysLead ? fx.SellAmount : fx.BuyAmount)),
    spot: rate(fx.SpotRate),
    rate: rate(fx.ForwardRate),
    mcRefNo: (app.ZtsfMcRefNo ?? '').trim(),
    status: status ? fxTxnStatusLabel(status) : '',
    // ZSET_CHECK (ZSGTSFTR_TRD_POS) is not served: no leg is shown as settled.
    statusChip: 'chip-open',
    doc1: '',
    doc2: '',
  }
}

const bySeq = (a: FxDeal, b: FxDeal) => (a.seq + a.dealType + a.rfha < b.seq + b.dealType + b.rfha ? -1 : 1)

/** The Deal ID's FX legs, reversed deals dropped, ordered by Seq / Deal Type / transaction. */
export async function loadFxLegs(dealId: string, signal?: AbortSignal): Promise<FxDeal[]> {
  const joined = await loadFxWithApp(`ZtsfDealID eq ${odataString(dealId)}`, signal)
  return joined.filter(({ fx }) => fx.ActiveStatus !== '3').map(toFxDeal).sort(bySeq)
}

export const INVOICE_WAITING = `${WAITING} — ZSGTSFTR_TRD_POS has no middleware resource ("tradePosition" is ZSGSLCTR_TRD_POS, the SLC table), and ${NOT_EXPORTED}: the default legs from ZSGTSFTR_SET_TYP / ZSGTSFTR_BIL_ADJ / ZSGTSFTR_INV_REF cannot be reproduced.`
export const HEADSUP_WAITING = `${WAITING} — ${NOT_EXPORTED}; the Headsup reminders (ZSGTSFTR_EMLBD / READ_TEXT) cannot be reproduced.`
export const DMS_LIST_WAITING = `${WAITING} — the Deal ID documents are kept by FM ZSGTSFFM_DMS / ZSGTSFTR_DEALDMS, which have no API.`
export const VIEW_INVOICE_WAITING = `${WAITING} — View Trade Invoice submits ZSGTSF_RDEAL_ID_INV (ZSGTSFTR_BIL_ADJ / ZSGTSFTR_BL / ZSGTSFTR_BL_RUSE); ${NOT_EXPORTED}.`
export const OPTIONS_WAITING = `${WAITING} — value help not exported`
export const pnlWaiting = (legs: string) => `${legs} The P&L is computed from the FX legs.`
export const diffWaiting = (legs: string) => `${legs} The FX-Invoice Difference is computed from the FX legs and ZSGTSFTR_IN_SPOT.`

/** WAITING FOR ACTION API, in the brief's words. */
export const waitingAction = (what: string, apis: string): string =>
  `WAITING FOR ACTION API — ${what} (${apis}) has no API yet. Nothing was posted to SAP.`

/** Every function code; the BAPIs / FMs / tables are those the dependency note lists. */
export const ACTION_WAITING = {
  status: waitingAction('Deal ID Status change', 'UPDATE ZSGTSFTR_DEALID ZDEAL_STAT — statement not exported'),
  amend: waitingAction('Amend End Date', 'UPDATE ZSGTSFTR_DEALID ZREV_DEDATE — statement not exported'),
  initiate: waitingAction('Initiate Settlement', 'UPDATE ZSGTSFTR_DEALID ZDEAL_STAT, ZSGTSFTR_TRD_POS, ZSGTSFTR_IN_SPOT — statements not exported'),
  executionComplete: waitingAction('Execution Complete', 'UPDATE ZSGTSFTR_DEALID ZDEAL_STAT — statement not exported'),
  printing: waitingAction('Initiate Printing', 'FP_FUNCTION_MODULE_NAME, FP_JOB_OPEN, FP_JOB_CLOSE, READ_TEXT, ZSGTSFFM_CHANGE_AMT_TO_WORDS, BAPI_BUPA_ADDRESS_GETDETAIL'),
  dms: waitingAction('Edit DMS', 'FM ZSGTSFFM_DMS, UPDATE ZSGTSFTR_DEALDMS ZDDATE'),
  fxTest: waitingAction('Post Test Run', 'BAPI_FTR_FXT_CHANGE test run'),
  fxPrint: waitingAction('Print Letters', 'FP_FUNCTION_MODULE_NAME, FP_JOB_OPEN, FP_JOB_CLOSE, READ_TEXT, ZSGTSFFM_CHANGE_AMT_TO_WORDS'),
  fxUpdate: waitingAction('Update transaction', 'ZSGTRMFM_VTBFHA_EXPORT, BAPI_FTR_FXT_CHANGE, BAPI_TRANSACTION_COMMIT / _ROLLBACK'),
  fxPost: waitingAction('Post Accounting Entry', 'BAPI_FTR_FXT_CHANGE, MODIFY ZSGTSFTR_TRD_POS, BAPI_TRANSACTION_COMMIT / _ROLLBACK'),
  fxComplete: waitingAction('Settlement Complete (FX leg)', 'MODIFY ZSGTSFTR_TRD_POS ZSET_CHECK — statement not exported'),
  invPrint: waitingAction('Print Letters', 'FP_FUNCTION_MODULE_NAME, FP_JOB_OPEN, FP_JOB_CLOSE, READ_TEXT, ZSGTSFFM_CHANGE_AMT_TO_WORDS'),
  invUpdate: waitingAction('Update invoice posting', 'MODIFY ZSGTSFTR_TRD_POS — statement not exported'),
  invPost: waitingAction('Post Document', 'FI posting into BKPF, MODIFY ZSGTSFTR_TRD_POS ZBELNR — FM not named in the dependency note'),
  invComplete: waitingAction('Settlement Complete (invoice leg)', 'MODIFY ZSGTSFTR_TRD_POS ZSET_CHECK / ZPOST_CHECK — statement not exported'),
  letterPdf: waitingAction('Print PDF', 'FP_FUNCTION_MODULE_NAME, FP_JOB_OPEN, FP_JOB_CLOSE'),
} as const

/* ------------------------------------------------------------------ FX-Invoice Difference: Spot Rate */

/** TCURR rate type for the default spot rate: M, the standard translation rate. */
export const SPOT_RATE_TYPE = 'M'

/**
 * The pair a leg's spot rate is quoted in. A pair that contains USD is quoted as the other currency per
 * USD, which is the direction the Create Spot arithmetic divides / multiplies by; any other pair is
 * quoted curr1 -> curr2.
 */
export function spotQuotePair(curr1: string, curr2: string): { from: string; to: string } {
  return curr2 === 'USD' && curr1 !== 'USD' ? { from: 'USD', to: curr1 } : { from: curr1, to: curr2 }
}

/**
 * The default Spot Rate of each leg, from TCURR (the latest rate on or before today), standing in for
 * BAPI_EXCHANGERATE_GETDETAIL. A leg with no usable TCURR rate keeps the transaction's own spot rate.
 */
export async function tcurrSpotRates(
  legs: readonly FxDeal[],
  today: Date = new Date(),
  lookup: GetExchangeRate = getExchangeRate,
  signal?: AbortSignal,
): Promise<string[]> {
  const date = isoFromDate(today) ?? ''
  return Promise.all(
    legs.map(async (leg) => {
      const { from, to } = spotQuotePair(leg.curr1, leg.curr2)
      const found = await lookup(from, to, date, SPOT_RATE_TYPE, signal).catch(() => null)
      return found !== null && found > 0 ? found.toFixed(4) : leg.spot
    }),
  )
}

/* ------------------------------------------------------------------ FX-Invoice Difference: Save Spot Data */

export type SpotLegResult = { dealType: string; rfha: string; ok: boolean; message: string }

const dateFromDmy = (dmy: string): Date | null => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy)
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null
}

/**
 * The IN_SPOT row a leg's Spot is booked against: same Deal Type, belonging to this leg's transaction (or to no
 * transaction yet), with a DSS type and a difference still to cover, and no Spot booked.
 */
export function pickInSpotRow(rows: readonly FxRow[], leg: Pick<FxDeal, 'dealType' | 'rfha'>): FxRow | undefined {
  return rows.find(
    (r) =>
      txt(r, 'ZDEAL_TYPE') === leg.dealType &&
      (txt(r, 'ZRFHA') === '' || txt(r, 'ZRFHA') === leg.rfha) &&
      txt(r, 'ZDSS_TYPE') !== '' &&
      num(r['ZD_AMT']) !== 0 &&
      txt(r, 'ZSPOT_TXN') === '',
  )
}

/**
 * Save Spot Data. The entered rate is NOT stored in ZSGTSFTR_IN_SPOT, which has no column for it. Per leg this is the
 * Additional Spot Booking flow: POST a standard FxTransaction (SpotRate = ForwardRate = the rate), write its APP_STR
 * row (TXN_STATUS 03, deal type = the DSS type, Deal linkage copied), then set only ZSPOT_TXN / ZSPOT_CREATE on IN_SPOT.
 *
 * Every leg is tried and reported on its own: a booked Spot is real, so one leg failing must not hide another that
 * went through. A leg with no IN_SPOT row to cover, or no rate, is skipped and says why.
 */
export async function saveSpotData(
  dealId: string,
  legs: readonly FxDeal[],
  rates: readonly string[],
  deps: { ports?: SpotPorts; listInSpot?: (dealId: string) => Promise<FxRow[]>; now?: Date } = {},
): Promise<SpotLegResult[]> {
  const ports = deps.ports ?? spotPorts
  const inSpot = await (deps.listInSpot ?? ((id) => fxList('inSpot', { ZDEAL_ID: id })))(dealId)
  const empty = { companies: new Map<string, string>(), fx: new Map<string, FxRow>() }
  const results: SpotLegResult[] = []

  for (const [i, leg] of legs.entries()) {
    const done = (ok: boolean, message: string) => results.push({ dealType: leg.dealType, rfha: leg.rfha, ok, message })
    const rate = Number(String(rates[i] ?? '').trim())
    if (!(rate > 0)) {
      done(false, 'Enter a valid spot rate.')
      continue
    }
    const inSpotRow = pickInSpotRow(inSpot, leg)
    if (!inSpotRow) {
      done(false, 'No Spot to book: ZSGTSFTR_IN_SPOT has no open difference for this leg.')
      continue
    }
    const row = { ...toSpotRow(inSpotRow, empty), companyCode: txt(inSpotRow, 'ZBUKRS') || leg.bukrs, originalTxn: txt(inSpotRow, 'ZRFHA') || leg.rfha }
    const valueDate = dateFromDmy(leg.valDate)
    const tradeDate = valueDate ? defaultTradeDate(valueDate) : (deps.now ?? new Date())
    const out = await createAdditionalSpot(ports, row, { partner: leg.bp, tradeDate, rate })
    if (out.stage === 'refused') {
      done(false, out.messages.join(' '))
    } else if (out.persist.appStr === 'done' && out.persist.inSpot === 'done') {
      done(true, `Spot ${out.created.transaction} booked at ${rate}.`)
    } else {
      const failed = [out.persist.appStr !== 'done' ? `APP_STR: ${out.persist.appStr}` : '', out.persist.inSpot !== 'done' ? `IN_SPOT: ${out.persist.inSpot}` : '']
      done(false, `Spot ${out.created.transaction} was booked in SAP, but ${failed.filter(Boolean).join('; ')}.`)
    }
  }
  return results
}

/* ------------------------------------------------------------------ Deal ID picker */

export type DealPick = { dealId: string; statusText: string }
export type DealList = { state: 'sap'; picks: DealPick[] } | { state: 'unavailable'; reason: string }

export function toPick(row: FxRow, statuses: readonly FxRow[]): DealPick {
  return { dealId: txt(row, 'ZDEAL_ID'), statusText: dealStatusText({ statuses }, txt(row, 'ZSUB_TYPE'), txt(row, 'ZDEAL_STAT')) }
}

/** Every ZSGTSFTR_DEALID row (newest first), unrestricted: the P_DEAL search help is not exported. */
export async function loadDealList(signal?: AbortSignal): Promise<DealList> {
  try {
    const [rows, statuses] = await Promise.all([listDealIds({}, signal), fxList('tsfDealStatus', {}, { signal })])
    const seen = new Set<string>()
    const picks = rows
      .map((r) => toPick(r, statuses))
      .filter((p) => p.dealId && !seen.has(p.dealId) && (seen.add(p.dealId), true))
    return { state: 'sap', picks }
  } catch (error) {
    if (isAbort(error)) throw error
    return { state: 'unavailable', reason: `${WAITING_DEAL_ID_API} — ZSGTSFTR_DEALID (middleware "tsfDealId") could not be read: ${messageOf(error)}` }
  }
}

/* ------------------------------------------------------------------ Header */

/** ZSGTSFTR_DEAL_ST rows of the deal's type + sub type, non-blank, sorted, one per code. */
export function statusList(statuses: readonly FxRow[], dealType: string, subType: string): StatusMeta[] {
  const list = statuses
    .filter((r) => txt(r, 'ZDEAL_TYPE') === dealType && txt(r, 'ZSUB_TYPE') === subType && txt(r, 'ZDEAL_STAT') !== '')
    .map((r) => ({ code: txt(r, 'ZDEAL_STAT'), text: txt(r, 'ZDEAL_SDESC'), cls: statusClass(txt(r, 'ZDEAL_STAT')) }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  return list.filter((v, i) => i === 0 || list[i - 1]!.code !== v.code)
}

export function toDeal(input: { deal: FxRow; mc: FxRow | undefined; model: FxRow | undefined; trader: FxRow | undefined }): Deal {
  const { deal, mc, model, trader } = input
  const m = (col: string) => (mc ? txt(mc, col) : '')
  return {
    dealId: txt(deal, 'ZDEAL_ID'),
    dealStartDate: dmyFromIso(deal['ZS_DATE']),
    dealEndDate: dmyFromIso(deal['ZE_DATE']),
    revisedEndDate: dmyFromIso(deal['ZREV_DEDATE']),
    mcRefNo: txt(deal, 'ZMC_REF'),
    mcDesc: m('ZMC_DESC'),
    mcDate: dmyFromIso(mc?.['ZMC_DATE']),
    shipEndDate: dmyFromIso(mc?.['ZSHIP_END']),
    fxModelId: m('ZMOD_ID'),
    fxModelDesc: m('ZMOD_DESC'),
    entityString: m('ZENT_DESC'),
    fxInvModel: txt(deal, 'ZFX_INV_MODEL'),
    trader: txt(deal, 'ZTRD_CODE'),
    traderDesc: trader ? txt(trader, 'ZTRADER') : '',
    currencyString: txt(deal, 'ZDEAL_CURR_DESC'),
    dealStatus: txt(deal, 'ZDEAL_STAT'),
    noInvoiceFlag: model ? txt(model, 'ZNO_INV') !== '' : false,
  }
}

/* ------------------------------------------------------------------ One Deal ID */

export type DealScreen = {
  deal: Deal
  statuses: StatusMeta[]
  fxDeals: FxDeal[]
  legsWaiting: string
}

/** The FX legs; unreadable APP_STR / FxTransaction leaves the grid empty with the reason, never a guess. */
async function legsOrWaiting(dealId: string, signal?: AbortSignal): Promise<{ fxDeals: FxDeal[]; legsWaiting: string }> {
  try {
    const fxDeals = await loadFxLegs(dealId, signal)
    return { fxDeals, legsWaiting: legsWaitingReason(fxDeals.length) }
  } catch (error) {
    if (isAbort(error)) throw error
    return { fxDeals: [], legsWaiting: legsUnavailable(messageOf(error)) }
  }
}

const none = Promise.resolve([] as FxRow[])

/** The Deal ID's header by key. Null when ZSGTSFTR_DEALID has no such row; throws when unreadable. */
export async function loadDealScreen(dealId: string, signal?: AbortSignal): Promise<DealScreen | null> {
  const rows = await fxList('tsfDealId', { ZDEAL_ID: dealId }, { signal })
  const deal = rows[0]
  if (!deal) return null
  const mcRef = txt(deal, 'ZMC_REF')
  const trdCode = txt(deal, 'ZTRD_CODE')
  const dealType = txt(deal, 'ZDEAL_TYPE')
  const subType = txt(deal, 'ZSUB_TYPE')
  const [mcs, traders, statuses, legs] = await Promise.all([
    mcRef ? fxList('masterContract', { ZMC_REF_NO: mcRef }, { signal }) : none,
    trdCode ? fxList('trmTrader', { ZTCODE: trdCode }, { signal }) : none,
    dealType && subType ? fxList('tsfDealStatus', { ZDEAL_TYPE: dealType, ZSUB_TYPE: subType }, { signal }) : none,
    legsOrWaiting(dealId, signal),
  ])
  const mc = mcs[0]
  const modelId = mc ? txt(mc, 'ZMOD_ID') : ''
  const models = modelId ? await fxList('fxModel', { ZMOD_ID: modelId }, { signal }) : []
  return {
    deal: toDeal({ deal, mc, model: models[0], trader: traders[0] }),
    statuses: statusList(statuses, dealType, subType),
    fxDeals: legs.fxDeals,
    legsWaiting: legs.legsWaiting,
  }
}
