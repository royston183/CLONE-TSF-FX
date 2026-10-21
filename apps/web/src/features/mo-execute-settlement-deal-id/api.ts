/**
 * MO: Execute Settlement for Deal ID (Single Deal ID) — ZSGTSFR060 / ZSGTSF_RDEAL_TRD_INV,
 * against the SLC middleware.
 *
 * Source: ZSGTSF_RDEAL_TRD_INV_UI_DATA_EXPORT_20261016_140702 (PBO / DIFF / DIFF_NEW).
 * The screen reads the selected Deal ID and its model's settlement configuration:
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
 *                            APP_STR's; SET_FX supplies sequence and DSS links; other FX data is SAP's.
 *
 * Trade Invoice grid       SET_TYP + BIL_ADJ with stored settlement state in cloud TRD_POS.
 * Headsup                  headsup.ts ports DIFF.PROCESS_DATA; its action text is SET_TYP's.
 * FX-Invoice Difference    differenceApi.ts ports DIFF_NEW; this is separate from Headsup.
 * Settlement               settlement.ts writes cloud TRD_POS, SAP APP_STR and cloud DEALID.
 * Accounting               posted through BO, not from this MO screen. Option transactions
 *                          (ZSGTSFCDS_OPTION) and SAP printing still have no API.
 * Save Spot Data books the Spot through the
 *   Additional Spot Booking flow (standard FxTransaction + APP_STR + IN_SPOT ZSPOT_TXN/ZSPOT_CREATE); the
 *   entered rate is not stored in IN_SPOT. Its default rate is TCURR (type M, today).
 *
 * Nothing falls back to sample data (the legacy seeds live in fixtures.ts, for tests only).
 */
import { dealStatusText, listDealIds } from '../../shared/fx/deal-id.ts'
import { messageOf } from '../../shared/fx/master-contract.ts'
import { txt } from '../../shared/fx/masters.ts'
import { paymentAmount, type PayDeal } from '../../shared/fx/payment-amount.ts'
import { apiFetch, odataString, service } from '@slc/api-client'
import { loadFxWithApp, type FxWithApp } from '../../shared/fx/app-str.ts'
import { getExchangeRate, type GetExchangeRate } from '../../shared/fx/exchange-rate.ts'
import { fxList, isAbort, type FxRow } from '../../shared/fx/mw.ts'
import { invoiceBankOf } from '../../shared/fx/invoice-bank.ts'
import { dmyFromIso, isoFromDate } from '../../shared/fx/sap.ts'
import { createAdditionalSpot, defaultTradeDate, type SpotPorts } from '../fo-additional-spot-booking/spotCreate.ts'
import { spotPorts } from '../fo-additional-spot-booking/spotPorts.ts'
import { toSpotRow } from '../fo-additional-spot-booking/spotList.ts'
import { fxTxnStatusLabel } from '../../shared/fx/txn-status.ts'
import { statusClass } from './logic.ts'
import type { Deal, FxDeal, SetFxSide, StatusMeta, TradeInvoice } from './types.ts'

export const WAITING = 'WAITING FOR API'
export const WAITING_DEAL_ID_API = 'WAITING FOR DEAL ID API'

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
  const settled = app.ZtsfExeCo === true
  return {
    // Replaced by ZSGTSFTR_SET_FX ZSEQ once the model is known (withSetFx).
    seq: (app.ZtsfDealSq ?? '').trim(),
    dealType: type,
    dealTypeChip: type === 'D1' ? 'chip-d1' : type === 'D2' ? 'chip-d2' : 'chip-t',
    rfha: fx.FinancialTransaction,
    bukrs: fx.CompanyCode,
    txnType: fx.TransactionType ?? '',
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
    // Settlement Complete (Execution): VTBFHA ZTSF_EXE_CO, gt_top-set_co in ZSGTSF_RDEAL_TRD_INV.
    status: settled ? 'Settled' : status ? fxTxnStatusLabel(status) : '',
    statusChip: settled ? 'chip-done' : 'chip-open',
    // Doc No 1 / 2 are BKPF documents (BLART TR, XREF2_HD TSF, XBLNR = transaction): BKPF has no resource.
    doc1: '',
    doc2: '',
    settled,
    tsf: {
      bhbkid: s(app.ZtsfBhbkID),
      bhktid: s(app.ZtsfBhktID),
      shbkid: s(app.ZtsfShbkID),
      shktid: s(app.ZtsfShktID),
      bpayid: s(app.ZtsfBpayID),
      spayid: s(app.ZtsfSpayID),
      rbukrs: s(app.ZtsfRbukrs),
      rpayid: s(app.ZtsfRpayID),
      pbukrs: s(app.ZtsfPbukrs),
      ppayid: s(app.ZtsfPpayID),
    },
  }
}

const s = (v: string | null | undefined): string => (v ?? '').trim()

/** One ZSGTSFTR_SET_FX row as a side of a leg. */
function toSetFxSide(r: FxRow): SetFxSide {
  return {
    seq: txt(r, 'ZSEQ'),
    dssDeal: txt(r, 'ZDSS_DEAL'),
    curr: txt(r, 'ZCURR'),
    acc: txt(r, 'ZACC'),
    trfType: txt(r, 'ZTRF_TYPE'),
    rbukrs: txt(r, 'ZRBUKRS'),
    payId: txt(r, 'ZPAY_ID'),
    bankId: txt(r, 'ZBANK_ID'),
    letCode: txt(r, 'ZLET_CODE'),
    letName: txt(r, 'ZLET_NAME'),
    desc: txt(r, 'ZSET_DESC'),
  }
}

/**
 * The model's ZSGTSFTR_SET_FX laid over the FX legs, as ZSGTSF_RDEAL_TRD_INV's PBO does: the leg's sequence and DSS
 * deal from the first row of its deal type, its buy / sell rows for the popup, and a DSS leg takes the sequence of
 * the leg it belongs to.
 */
export function withSetFx(legs: readonly FxDeal[], setFx: readonly FxRow[]): FxDeal[] {
  const out = legs.map((leg) => {
    const rows = setFx.filter((r) => txt(r, 'ZD_MAP') === leg.dealType)
    const first = rows[0]
    const buy = rows.find((r) => txt(r, 'ZBS') === 'B')
    const sell = rows.find((r) => txt(r, 'ZBS') === 'S')
    return {
      ...leg,
      seq: first ? txt(first, 'ZSEQ') : '',
      dssDeal: first ? txt(first, 'ZDSS_DEAL') : '',
      ...(buy ? { setFxBuy: toSetFxSide(buy) } : {}),
      ...(sell ? { setFxSell: toSetFxSide(sell) } : {}),
    }
  })
  for (const leg of out) {
    if (!leg.dssDeal) continue
    const dss = out.find((l) => l.dealType === leg.dssDeal)
    if (dss) dss.seq = leg.seq
  }
  return out
}

const bySeq = (a: FxDeal, b: FxDeal) => (a.seq + a.dealType + a.rfha < b.seq + b.dealType + b.rfha ? -1 : 1)

/** The Deal ID's FX legs, reversed deals dropped, ordered by Seq / Deal Type / transaction. */
export async function loadFxLegs(dealId: string, signal?: AbortSignal): Promise<FxDeal[]> {
  const joined = await loadFxWithApp(`ZtsfDealID eq ${odataString(dealId)}`, signal)
  return joined.filter(({ fx }) => fx.ActiveStatus !== '3').map(toFxDeal).sort(bySeq)
}

/**
 * Trade Invoice grid, as ZSGTSF_RDEAL_TRD_INV (invoice_settlement_data) builds it:
 *
 *  - the rows are ZSGTSFTR_SET_TYP WHERE zmod_id = the Deal's model (middleware "setTyp"), so a Deal ID with no
 *    ZSGTSFTR_TRD_POS row still shows its default legs;
 *  - Invoice Amount is the sum of ZSGTSFTR_BIL_ADJ.ZAMT whose ZINV_REF+11(2) equals the row's ZT_TYPE+0(2);
 *  - Due Date is the D1 transaction's maturity (the 2025 change), else BIL_ADJ's ZDUE_DATE;
 *  - Receipt / Payment is ZT_TYPE+3(1): S = Receipt, P = Payment;
 *  - ZSGTSFTR_TRD_POS (cloud trdPos via /api/localdb/tsf-trade-position) is a LEFT
 *    join on ZT_TYPE: it only overlays what was saved before (settled flag, FI document, posting date).
 *
 * ZSGTSFTR_TRD_ACC (cloud tsfTrdAcc via /api/localdb/tsf-posting-type) is joined on
 * SET_TYP.ZFI_TYPE for the document type, the reference (ZXBLNR1) and the Dr / Cr line texts. The legacy join is an
 * INNER JOIN; here a leg with no TRD_ACC row is still shown (blank), with a note, so an unloaded configuration
 * table does not empty the grid.
 *
 * Not reproduced (stated on the screen, never guessed): the Payment Amount of a row whose settlement currency differs from its invoice currency
 * (invoice amount / the mapped transaction's total rate, minus the premium adjustment), and the final model
 * (GV_MOD) adjustments for the FX invoice model: the Deal's MC model is used as it is.
 */
const tradePositionApi = service('localdb')('tsf-trade-position')
const postingTypeApi = service('localdb')('tsf-posting-type')

export const INVOICE_WAITING = "ZSGTSFTR_SET_TYP has no leg for this Deal ID's model."
export const invoicesUnavailable = (why: string): string => `${WAITING} — the Trade Invoice legs could not be read (ZSGTSFTR_SET_TYP / ZSGTSFTR_BIL_ADJ): ${why}`
export const INVOICE_GAPS = `${WAITING} — Payment Amount of a leg whose settlement currency differs needs the mapped transaction's total rate and the premium adjustment.`
export const noPostingType = (types: readonly string[]): string => ` No ZSGTSFTR_TRD_ACC row is loaded for posting type ${types.join(', ')}: its document type, reference and Dr / Cr texts are blank.`

/** A SAP DATS value (YYYYMMDD, or 00000000 / blank for none) as DD-MM-YYYY. */
const dmyFromSap = (v: string): string => (/^[0-9]{8}$/.test(v) && v !== '00000000' ? `${v.slice(6, 8)}-${v.slice(4, 6)}-${v.slice(0, 4)}` : '')

const text = (r: Record<string, unknown>, k: string): string => String(r[k] ?? '').trim()

/**
 * The grid rows: one per ZSGTSFTR_SET_TYP row of the model, amounts from BIL_ADJ, the saved TRD_POS state laid
 * over them by ZT_TYPE. `d1Due` is the D1 leg's maturity as DD-MM-YYYY ('' when there is none).
 */
export function buildTradeInvoices(
  setTyp: readonly Record<string, unknown>[],
  billAdj: readonly Record<string, unknown>[],
  positions: readonly Record<string, unknown>[],
  accounting: readonly Record<string, unknown>[],
  d1Due: string,
  fxDeals: readonly FxDeal[] = [],
): TradeInvoice[] {
  const payDeals: PayDeal[] = fxDeals.map((f) => ({ dealType: f.dealType, rate: num(f.rate) }))
  const saved = new Map(positions.map((p) => [text(p, 'ZT_TYPE'), p]))
  const acc = new Map(accounting.map((a) => [text(a, 'ZFI_TYPE'), a]))
  return [...setTyp]
    // In settlement sequence (ZSEQ): the previous-sequence checks of Settlement Complete read the leg before.
    .sort((a, b) => Number(text(a, 'ZSEQ')) - Number(text(b, 'ZSEQ')) || text(a, 'ZT_TYPE').localeCompare(text(b, 'ZT_TYPE')))
    .map((t) => {
      const type = text(t, 'ZT_TYPE')
      const matches = billAdj.filter((b) => text(b, 'ZINV_REF').slice(11, 13) === type.slice(0, 2))
      const invAmt = matches.reduce((sum, b) => sum + num(b['ZAMT']), 0)
      // The bank assigned to the leg's invoice in Generate Invoices: where the Receiver / Payee (the seller) is paid.
      const assigned = invoiceBankOf(matches, type)
      const pos = saved.get(type)
      const post = acc.get(text(t, 'ZFI_TYPE'))
      const curr = text(t, 'ZCURR')
      const pay = paymentAmount({ invAmt, curr, setCurr: text(t, 'ZSET_CURR'), dMap: text(t, 'ZD_MAP'), premAdj: text(t, 'ZPREM_ADJ') }, payDeals)
      const recPay = type.charAt(3) === 'P' ? 'Payment' : type.charAt(3) === 'S' ? 'Receipt' : ''
      return {
        leg: type,
        trfDesc: text(t, 'ZSET_DESC'),
        docType: post ? text(post, 'ZDOC_TYPE') : '',
        xblnr: post ? text(post, 'ZXBLNR1') : '',
        drPost: post ? text(post, 'ZDR_TEXT') : '',
        crPost: post ? text(post, 'ZCR_TEXT') : '',
        dueDate: d1Due || dmyFromIso(text(matches[0] ?? {}, 'ZDUE_DATE')),
        postDate: pos ? dmyFromSap(text(pos, 'ZP_DATE')) : '',
        invAmt,
        curr,
        // Same currency: the invoice amount. A different settlement currency: the invoice amount / the all-in rate of the
        // FX deal the leg maps to (ZD_MAP), less its premium adjustment (shared/fx/payment-amount.ts). Zero, with the
        // reason, when that deal or its rate does not exist yet; never a guessed amount.
        payAmt: pay.amount,
        payReason: pay.reason,
        recPay,
        trfType: text(t, 'ZTRF_TYPE'),
        fiDoc: pos ? text(pos, 'ZBELNR') : '',
        // Settlement Complete (Execution): TRD_POS ZEXE_CO, gt_inv-set_co in ZSGTSF_RDEAL_TRD_INV.
        setCo: pos ? text(pos, 'ZEXE_CO') === 'X' : false,
        // SET_TYP configuration (the "Settlement" and "FI Posting" checkboxes of popup 9002), not a status.
        setCheck: text(t, 'ZSET_CHECK') === 'X',
        dssDeal: text(t, 'ZDSS_DEAL'),
        setType: text(t, 'ZSET_TYPE'),
        fiType: text(t, 'ZFI_TYPE'),
        postDesc: text(t, 'ZPOST_DESC'),
        // The settlement sequence: ZSGTSFTR_TRD_POS ZSEQ, and the Sequence column of ZSGTSFR081 (T3-P = 1 .. T1-S = 6 on M033).
        seq: text(t, 'ZSEQ'),
        setCurr: text(t, 'ZSET_CURR'),
        bukrs: text(t, 'ZBUKRS'),
        dMap: text(t, 'ZD_MAP'),
        // SET_TYP ZPOST_CHECK is the leg's FI Posting flag (is it posted to FI at all); a posted leg has a ZBELNR.
        postRequired: text(t, 'ZPOST_CHECK') === 'X',
        buy: text(t, 'ZBUY'),
        sell: text(t, 'ZSELL'),
        // TRD_POS, kept by Update / Settlement Complete (save_bank_data). The VTBSTC1 (pay ID TRDINV) default the
        // program shows before that has no resource, so the field is blank until stored. A Receipt leg has none.
        // The receiver falls back to the bank assigned on the invoice in Generate Invoices.
        senderHouseBank: pos && recPay !== 'Receipt' ? text(pos, 'ZHBKID') : '',
        senderAccountId: pos && recPay !== 'Receipt' ? text(pos, 'ZHKTID') : '',
        receiverHouseBank: (pos ? text(pos, 'ZREC_HBKID') : '') || assigned.houseBank,
        receiverAccountId: (pos ? text(pos, 'ZREC_HKTID') : '') || assigned.accountId,
        partnerBank: assigned.partnerBank,
        businessPartner: assigned.businessPartner,
      }
    })
}

/** Every posting type of ZSGTSFTR_TRD_ACC (cloud tsfTrdAcc). */
export async function loadPostingTypes(signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const body = await apiFetch<{ value?: Record<string, unknown>[] }>(postingTypeApi, signal ? { signal } : undefined)
  return body?.value ?? []
}

/** The Deal ID's stored trade positions (cloud trdPos), in sequence order. */
export async function loadTradePositions(dealId: string, signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const body = await apiFetch<{ value?: Record<string, unknown>[] }>(`${tradePositionApi}?ZDEAL_ID=${encodeURIComponent(dealId)}`, signal ? { signal } : undefined)
  return body?.value ?? []
}

export const VIEW_INVOICE_WAITING = 'No trade invoices are available for this Deal ID.'
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
  printing: waitingAction('Initiate Printing', 'FP_FUNCTION_MODULE_NAME, FP_JOB_OPEN, FP_JOB_CLOSE, READ_TEXT, ZSGTSFFM_CHANGE_AMT_TO_WORDS, BAPI_BUPA_ADDRESS_GETDETAIL'),
  fxPrint: waitingAction('Print Letters', 'FP_FUNCTION_MODULE_NAME, FP_JOB_OPEN, FP_JOB_CLOSE, READ_TEXT, ZSGTSFFM_CHANGE_AMT_TO_WORDS'),
  fxUpdate: waitingAction('Update transaction', 'ZSGTRMFM_VTBFHA_EXPORT, BAPI_FTR_FXT_CHANGE, BAPI_TRANSACTION_COMMIT / _ROLLBACK'),
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

export type DealPick = { dealId: string; statusText: string; statusCode?: string; fxModel?: string; entityString?: string }
export type DealList = { state: 'sap'; picks: DealPick[] } | { state: 'unavailable'; reason: string }

export function toPick(row: FxRow, statuses: readonly FxRow[]): DealPick {
  return { dealId: txt(row, 'ZDEAL_ID'), statusText: dealStatusText({ statuses }, txt(row, 'ZSUB_TYPE'), txt(row, 'ZDEAL_STAT')) }
}

/** Every ZSGTSFTR_DEALID row (newest first), unrestricted: the P_DEAL search help is not exported. */
export async function loadDealList(signal?: AbortSignal): Promise<DealList> {
  try {
    const [rows, statuses, mcs] = await Promise.all([
      listDealIds({}, signal),
      fxList('tsfDealStatus', {}, { signal }),
      fxList('masterContract', {}, { signal }).catch(() => [] as FxRow[]),
    ])
    const seen = new Set<string>()
    const picks = rows
      .map((r): DealPick => {
        const mc = mcs.find((m) => txt(m, 'ZMC_REF_NO') === txt(r, 'ZMC_REF'))
        return {
          ...toPick(r, statuses),
          statusCode: txt(r, 'ZDEAL_STAT'),
          fxModel: mc ? [txt(mc, 'ZMOD_ID'), txt(mc, 'ZMOD_DESC')].filter(Boolean).join(' - ') : '',
          entityString: mc ? txt(mc, 'ZENT_DESC') : '',
        }
      })
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
    dealType: txt(deal, 'ZDEAL_TYPE'),
    subType: txt(deal, 'ZSUB_TYPE'),
  }
}

/* ------------------------------------------------------------------ One Deal ID */

export type DealScreen = {
  deal: Deal
  statuses: StatusMeta[]
  fxDeals: FxDeal[]
  legsWaiting: string
  invoices: TradeInvoice[]
  /** Why the Trade Invoice grid is empty: nothing stored, or the table could not be read. */
  invoicesWaiting: string
  /** The Deal ID's ZSGTSFTR_TRD_POS rows, so Initiate Settlement leaves rows already stored alone. */
  positions: Record<string, unknown>[]
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

/**
 * The Trade Invoice legs. SET_TYP and BIL_ADJ failing leaves the grid empty with the reason; the saved TRD_POS
 * state failing only leaves the defaults un-overlaid, and says so.
 */
async function invoicesOrWaiting(
  dealId: string,
  modelId: string,
  fxDeals: readonly FxDeal[],
  signal?: AbortSignal,
): Promise<{ invoices: TradeInvoice[]; invoicesWaiting: string; positions: Record<string, unknown>[] }> {
  try {
    const [setTyp, billAdj] = await Promise.all([
      modelId ? fxList('setTyp', { ZMOD_ID: modelId }, { signal }) : none,
      fxList('billAdjustment', { ZDEAL_ID: dealId }, { signal }),
    ])
    let positions: Record<string, unknown>[] = []
    let accounting: Record<string, unknown>[] = []
    let note = ''
    try {
      ;[positions, accounting] = await Promise.all([loadTradePositions(dealId, signal), loadPostingTypes(signal)])
    } catch (error) {
      if (isAbort(error)) throw error
      note = ` The saved settlement state / posting types (ZSGTSFTR_TRD_POS / ZSGTSFTR_TRD_ACC) could not be read: ${messageOf(error)}`
    }
    const d1 = fxDeals.find((f) => f.dealType === 'D1')
    const invoices = buildTradeInvoices(setTyp, billAdj, positions, accounting, d1?.valDate ?? '', fxDeals)
    const known = new Set(accounting.map((a) => String(a['ZFI_TYPE'] ?? '').trim()))
    const missing = [...new Set(setTyp.map((t) => String(t['ZFI_TYPE'] ?? '').trim()).filter((f) => f && !known.has(f)))].sort()
    return { positions, invoices, invoicesWaiting: invoices.length ? `${INVOICE_GAPS}${missing.length && !note ? noPostingType(missing) : ''}${note}` : INVOICE_WAITING }
  } catch (error) {
    if (isAbort(error)) throw error
    return { positions: [], invoices: [], invoicesWaiting: invoicesUnavailable(messageOf(error)) }
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
  const [models, setFx] = modelId
    ? await Promise.all([fxList('fxModel', { ZMOD_ID: modelId }, { signal }), fxList('setFx', { ZMOD_ID: modelId }, { signal })])
    : [[], []]
  const fxDeals = withSetFx(legs.fxDeals, setFx)
  const trade = await invoicesOrWaiting(dealId, modelId, fxDeals, signal)
  return {
    deal: toDeal({ deal, mc, model: models[0], trader: traders[0] }),
    statuses: statusList(statuses, dealType, subType),
    fxDeals,
    legsWaiting: legs.legsWaiting,
    invoices: trade.invoices,
    invoicesWaiting: trade.invoicesWaiting,
    positions: trade.positions,
  }
}
