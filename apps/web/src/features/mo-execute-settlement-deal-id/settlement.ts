/**
 * The settlement actions of MO: Execute Settlement for Deal ID (ZSGTSFR060), as ZSGTSF_RDEAL_TRD_INV codes them. MO
 * settles; it never posts (its TBB1 / TEST / SET_POST / POST_FX / POST_TI codes have no handler). The accounting
 * entries are BO's: ZSGTSFR081 (ZSGTSF_RDEAL_TRD_POST).
 *
 *   Initiate Settlement   F01 'INIT' -> PAI FORM save_data: one ZSGTSFTR_TRD_POS row per trade invoice leg, the
 *                         whole row from gt_inv (SET_TYP fields, keyed by SET_TYP-ZSEQ), then ZDEAL_STAT 20.
 *   Update (invoice)      POST 'UPD_DATA' -> save_bank_data: Sender / Receiver house bank and account on the rows
 *                         of the same trade type (both its S and P legs). Status must be 20+ or 05.
 *   Settlement Complete   POST 'SET_EXE' -> set_complete / set_update: the previous sequence must be complete
 *   (invoice)             (its leg's ZEXE_CO and the FX leg at that sequence), then save_bank_data and
 *                         TRD_POS ZEXE_CO = 'X'. Status must be 20+.
 *   Update (FX)           TXN_POST 'UPD' -> update_bank_vtbfha1(_vv): the transaction's TSF bank fields (VTBFHA
 *                         ZTSF_*), and the DSS deal's.
 *   Settlement Complete   TXN_POST 'SET_EXE' -> set_complete_txn: the previous sequence must be complete, then
 *   (FX)                  update_bank_vtbfha(_vv) with ZTSF_EXE_CO = 'X', for the leg and its DSS deal.
 *   Execution Complete    F01 'EXE_C': ZDEAL_STAT 21 when exactly six trade legs are complete and every FX leg they
 *                         map to is (no-invoice model: every mapped FX leg).
 *
 * Where it is written: ZSGTSFTR_TRD_POS is the gateway's local SQLite (/api/localdb/tsf-trade-position). The FX
 * fields go to SAP through TrmFxApp (ZSGTSFTR_APP_STR), which holds the VTBFHA TSF fields this app reads; the
 * program itself writes them with ZSGTRMFM_VTBFHA_EXPORT + BAPI_FTR_FXT_CHANGE. ZDEAL_STAT goes through the
 * middleware ("tsfDealId").
 *
 * The ZSGTSFRMSG message texts are not in the export, so the messages here say what the check is, with its number.
 */
import { apiFetch, service } from '@slc/api-client'
import { changedStamp } from '../../shared/fx/sap.ts'
import { fxUpdate } from '../../shared/fx/mw.ts'
import { updateAppStrRecord, type AppStrFields } from '../fx-blotter/appStr.ts'
import type { Deal, FxDeal, FxPostForm, InvPostForm, TradeInvoice } from './types.ts'

export const SETTLEMENT_INITIATED = '20'
export const EXECUTION_COMPLETED = '21'
/** EXE_C and BO's POST_TI count the completed trade legs against a fixed 6 (gv_count = 6). */
export const TRADE_LEGS = 6

const tradePositionApi = service('localdb')('tsf-trade-position')

/** A ZSGTSFTR_TRD_POS write: the row's key and the fields to set (the gateway stamps created / changed). */
export type PositionWrite = { seq: string; fields: Record<string, string | number> }

export type SettlementDeps = {
  putPosition: (dealId: string, write: PositionWrite) => Promise<void>
  setDealStatus: (deal: Deal, status: string) => Promise<void>
  /** The VTBFHA TSF fields of one transaction (TrmFxApp). */
  updateFx: (companyCode: string, transaction: string, fields: AppStrFields) => Promise<void>
}

export const defaultDeps: SettlementDeps = {
  putPosition: async (dealId, { seq, fields }) => {
    await apiFetch(`${tradePositionApi}/${encodeURIComponent(dealId)}/${encodeURIComponent(seq)}`, { method: 'PUT', body: fields })
  },
  setDealStatus: async (deal, status) => {
    await fxUpdate('tsfDealId', dealKey(deal), { ZDEAL_STAT: status, ...(await changedStamp()) })
  },
  updateFx: updateAppStrRecord,
}

export function dealKey(deal: Deal): Record<string, string> {
  return { ZDEAL_ID: deal.dealId, ZDEAL_TYPE: deal.dealType ?? '', ZSUB_TYPE: deal.subType ?? '' }
}

/** DD-MM-YYYY as SAP's DATS (YYYYMMDD); '' when it is not a date. */
export function sapDate(dmy: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dmy.trim())
  return m ? `${m[3]}${m[2]}${m[1]}` : ''
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string }

const failed = (what: string, error: unknown): ActionResult => ({
  ok: false,
  error: `${what} failed: ${error instanceof Error ? error.message : String(error)}`,
})

const stat = (deal: Deal) => parseInt(deal.dealStatus, 10) || 0

/**
 * Why a leg action is refused before 20 (I034): what the Deal ID still needs depends on where it is. Initiate
 * Settlement is offered from 05 (invoice created in TRM) to 19; below that the invoicing has to come first.
 */
export function notInitiated(deal: Pick<Deal, 'dealId' | 'dealStatus'>): string {
  const s = parseInt(deal.dealStatus, 10)
  const at = `Deal ID ${deal.dealId} is at status ${deal.dealStatus || '(none)'}`
  if (s >= 5) return `${at}. Click Initiate Settlement first: the legs can only be settled once the Deal ID is at 20 - Settlement Initiated.`
  return `${at}, so settlement cannot start yet. Initiate Settlement is offered from status 05 (Invoice Created in TRM) to 19: finish invoicing first, on MO: Generate Invoices for Deal ID (ZSGTSFR033).`
}

// ------------------------------------------------------------------ the sequence rule

/** E052: the previous sequence (sequence - 1) is not settled yet. */
export const previousNotSettled = (seq: number) =>
  `Sequence ${seq} is not settled yet: settle the legs in sequence order (E052).`

/**
 * The previous-sequence rule of set_complete / set_update (trade leg) and set_complete_txn (FX leg): sequence 1 may
 * always be settled; any later one only once the trade leg at sequence - 1 is complete and, if an FX leg sits at
 * that sequence, that FX leg too. Independent, unsequenced FX legs wait for the ordered legs to finish.
 * Returns the refusal, or '' when the leg may be settled.
 */
export function sequenceRefusal(seq: string, invoices: readonly TradeInvoice[], fxDeals: readonly FxDeal[], kind: 'trade' | 'fx'): string {
  const sequence = Number(seq)
  // SET_FX deliberately leaves independent legs such as D2 outside the invoice sequence.
  // Settle them only after the ordered legs; never turn an empty sequence into -1.
  if (!seq.trim() || sequence === 0) {
    if (kind === 'trade') return 'The trade invoice leg has no settlement sequence. Correct its settlement mapping before settling.'
    const openInvoices = invoices.filter((r) => !r.setCo)
    if (openInvoices.length) return `Settle the trade invoice legs first: ${openInvoices.map((r) => `${r.seq} ${r.leg}`).join(', ')} (E052).`
    const openFx = fxDeals.filter((r) => Number(r.seq) > 0 && !r.settled)
    if (openFx.length) return `Settle the sequenced FX legs first: ${openFx.map((r) => `${r.seq} ${r.dealType} ${r.rfha}`).join(', ')} (E052).`
    return ''
  }
  if (!Number.isInteger(sequence) || sequence < 1) return `Invalid settlement sequence '${seq}'. Correct its settlement mapping before settling.`
  const prev = sequence - 1
  if (prev === 0) return ''
  const inv = invoices.find((r) => Number(r.seq) === prev)
  const fx = fxDeals.find((r) => Number(r.seq) === prev)
  if (!inv) return previousNotSettled(prev)
  if (kind === 'fx') {
    if (fx && !fx.settled) return previousNotSettled(prev)
    return inv.setCo ? '' : previousNotSettled(prev)
  }
  if (!inv.setCo) return previousNotSettled(prev)
  if (fx && !fx.settled) return `The FX deal ${fx.dealType} ${fx.rfha} of sequence ${prev} is not settled yet (E068).`
  return ''
}

// ------------------------------------------------------------------ trade invoice legs

/** TRD_POS key of a trade leg: its SET_TYP sequence (ZSEQ). */
export const invoiceSeq = (r: TradeInvoice, idx: number): string => r.seq || String(idx + 1)

/**
 * The TRD_POS row Initiate Settlement writes for a leg (save_data: CORRESPONDING from gt_inv, then the explicit
 * fields). It is the whole row: as in the program, the completion flag, the FI document and its message start blank
 * again, on a row stored before too.
 */
export function invoicePosition(r: TradeInvoice, idx: number): PositionWrite {
  const due = sapDate(r.dueDate)
  return {
    seq: invoiceSeq(r, idx),
    fields: {
      ZT_TYPE: r.leg,
      ZSELL: r.sell ?? '',
      ZBUY: r.buy ?? '',
      ZCURR: r.curr,
      ZSET_CURR: r.setCurr ?? '',
      ZD_MAP: r.dMap ?? '',
      ZTRF_TYPE: r.trfType,
      ZSET_TYPE: r.setType ?? '',
      ZSET_DESC: r.trfDesc,
      ZSET_CHECK: r.setCheck ? 'X' : '',
      ZPOST_CHECK: r.postRequired ? 'X' : '',
      ZFI_TYPE: r.fiType ?? '',
      ZPOST_DESC: r.postDesc ?? '',
      ZPAY_AMT: r.payAmt,
      ZDOC_TYPE: r.docType,
      ZDUE_DATE: due,
      ZP_DATE: due,
      ZBUKRS: r.bukrs ?? '',
      ZAMT: r.invAmt,
      ZRP: r.recPay,
      ZHBKID: r.senderHouseBank ?? '',
      ZHKTID: r.senderAccountId ?? '',
      ZREC_HBKID: r.receiverHouseBank ?? '',
      ZREC_HKTID: r.receiverAccountId ?? '',
      ZEXE_CO: '',
      ZBELNR: '',
      ZMSG: '',
    },
  }
}

/** Initiate Settlement (offered 05..19): every trade leg's TRD_POS row, then ZDEAL_STAT 20 (S030). */
export async function initiateSettlement(deal: Deal, invoices: readonly TradeInvoice[], deps: SettlementDeps = defaultDeps): Promise<ActionResult> {
  if (!(stat(deal) >= 5 && stat(deal) <= 19)) {
    return { ok: false, error: `Settlement can only be initiated from status 05 to 19; Deal ID ${deal.dealId} is at ${deal.dealStatus}.` }
  }
  try {
    for (const [idx, r] of invoices.entries()) await deps.putPosition(deal.dealId, invoicePosition(r, idx))
  } catch (error) {
    return failed('Writing the settlement legs (ZSGTSFTR_TRD_POS)', error)
  }
  try {
    await deps.setDealStatus(deal, SETTLEMENT_INITIATED)
  } catch (error) {
    return failed(`The legs were written, but moving Deal ID ${deal.dealId} to ${SETTLEMENT_INITIATED}`, error)
  }
  return { ok: true, message: `Settlement initiated for Deal ID ${deal.dealId}: status 20 - Settlement Initiated.` }
}

/**
 * save_bank_data: the Sender / Payer (ZHBKID / ZHKTID) and Receiver / Payee (ZREC_HBKID / ZREC_HKTID) house bank and
 * account, on every leg of the same trade type (zt_type+0(2): T1-S and T1-P together).
 */
async function saveBankData(deal: Deal, r: TradeInvoice, invoices: readonly TradeInvoice[], form: InvPostForm, deps: SettlementDeps): Promise<void> {
  const fields = {
    ZHBKID: form.senderHouseBank.trim().toUpperCase().slice(0, 5),
    ZHKTID: form.senderAccountId.trim().toUpperCase().slice(0, 5),
    ZREC_HBKID: form.receiverHouseBank.trim().toUpperCase().slice(0, 5),
    ZREC_HKTID: form.receiverAccountId.trim().toUpperCase().slice(0, 5),
  }
  const type = r.leg.slice(0, 2)
  for (const [idx, leg] of invoices.entries()) {
    if (leg.leg.slice(0, 2) === type) await deps.putPosition(deal.dealId, { seq: invoiceSeq(leg, idx), fields })
  }
}

/** Update (UPD_DATA): allowed at 20 and later, or at 05 (I034 otherwise). Nothing is posted or completed. */
export async function updateInvoiceLeg(
  deal: Deal,
  r: TradeInvoice,
  invoices: readonly TradeInvoice[],
  form: InvPostForm,
  deps: SettlementDeps = defaultDeps,
): Promise<ActionResult> {
  if (!(stat(deal) >= 20 || stat(deal) === 5)) return { ok: false, error: notInitiated(deal) }
  try {
    await saveBankData(deal, r, invoices, form, deps)
    return { ok: true, message: `Bank data of ${r.leg.slice(0, 2)} updated (S033).` }
  } catch (error) {
    return failed(`Updating leg ${r.leg}`, error)
  }
}

/** Settlement Complete (SET_EXE): status 20+, the sequence rule, save_bank_data, then ZEXE_CO = 'X' (S051). */
export async function completeInvoiceLeg(
  deal: Deal,
  r: TradeInvoice,
  invoices: readonly TradeInvoice[],
  fxDeals: readonly FxDeal[],
  form: InvPostForm,
  deps: SettlementDeps = defaultDeps,
): Promise<ActionResult> {
  if (stat(deal) < 20) return { ok: false, error: notInitiated(deal) }
  if (r.setCo) return { ok: false, error: `Sequence ${r.seq} (${r.leg}) is already settled.` }
  const refusal = sequenceRefusal(r.seq ?? '', invoices, fxDeals, 'trade')
  if (refusal) return { ok: false, error: refusal }
  try {
    await saveBankData(deal, r, invoices, form, deps)
    await deps.putPosition(deal.dealId, { seq: invoiceSeq(r, invoices.indexOf(r)), fields: { ZEXE_CO: 'X' } })
    return { ok: true, message: `Sequence ${r.seq} (${r.leg}) settled (S051). Its accounting entry is posted on BO: Post Accounting Entries for Settlement (ZSGTSFR081).` }
  } catch (error) {
    return failed(`Settling leg ${r.leg}`, error)
  }
}

// ------------------------------------------------------------------ FX legs

/** The buy / sell currency of a leg (SET_FX ZBS 'B' / 'S' ZCURR against the leg's two currencies). */
function sides(leg: FxDeal): { bcurr: string; scurr: string } {
  const pick = (curr: string | undefined) => (curr === leg.curr1 ? leg.curr1 : leg.curr2)
  return { bcurr: pick(leg.setFxBuy?.curr), scurr: pick(leg.setFxSell?.curr) }
}

/** The TSF bank fields both update FORMs send (ZZAPST_TSF without ZTSF_EXE_CO). */
export type TsfFields = Required<
  Pick<
    AppStrFields,
    | 'ZtsfBhbkID' | 'ZtsfBhktID' | 'ZtsfShbkID' | 'ZtsfShktID' | 'ZtsfBpayID' | 'ZtsfSpayID' | 'ZtsfRbukrs' | 'ZtsfRpayID'
    | 'ZtsfPbukrs' | 'ZtsfPpayID' | 'ZtsfTrftype' | 'ZtsfTrftype2' | 'ZtsfBnktype' | 'ZtsfBnktype2' | 'ZtsfBcurr' | 'ZtsfScurr'
  >
>

/** update_bank_vtbfha(1): the popup's fields as VTBFHA ZTSF_* (ZZAPST_TSF), on the leg itself. */
export function tsfFields(leg: FxDeal, form: FxPostForm): TsfFields {
  const { bcurr, scurr } = sides(leg)
  return {
    ZtsfBhbkID: form.bHouseBank,
    ZtsfBhktID: form.bAccountId,
    ZtsfShbkID: form.sHouseBank,
    ZtsfShktID: form.sAccountId,
    ZtsfBpayID: form.bBankId,
    ZtsfSpayID: form.sBankId,
    ZtsfRbukrs: form.bRecCoCode,
    ZtsfRpayID: form.bPaymentId,
    ZtsfPbukrs: form.sPayCoCode,
    ZtsfPpayID: form.sPaymentId,
    ZtsfTrftype: leg.setFxBuy?.trfType ?? '',
    ZtsfTrftype2: leg.setFxSell?.trfType ?? '',
    ZtsfBnktype: leg.setFxBuy?.acc ?? '',
    ZtsfBnktype2: leg.setFxSell?.acc ?? '',
    ZtsfBcurr: bcurr,
    ZtsfScurr: scurr,
  }
}

/** update_bank_vtbfha(1)_vv: the same fields with buy and sell swapped, for a DSS deal that runs the other way. */
export function tsfFieldsSwapped(leg: FxDeal, form: FxPostForm): TsfFields {
  const f = tsfFields(leg, form)
  return {
    ZtsfBhbkID: f.ZtsfShbkID,
    ZtsfBhktID: f.ZtsfShktID,
    ZtsfShbkID: f.ZtsfBhbkID,
    ZtsfShktID: f.ZtsfBhktID,
    ZtsfBpayID: f.ZtsfSpayID,
    ZtsfSpayID: f.ZtsfBpayID,
    ZtsfRbukrs: f.ZtsfPbukrs,
    ZtsfRpayID: f.ZtsfPpayID,
    ZtsfPbukrs: f.ZtsfRbukrs,
    ZtsfPpayID: f.ZtsfRpayID,
    ZtsfTrftype: f.ZtsfTrftype2,
    ZtsfTrftype2: f.ZtsfTrftype,
    ZtsfBnktype: f.ZtsfBnktype2,
    ZtsfBnktype2: f.ZtsfBnktype,
    ZtsfBcurr: f.ZtsfScurr,
    ZtsfScurr: f.ZtsfBcurr,
  }
}

/**
 * The DSS deal written together with a leg, and whether it takes the fields as they are or swapped: same buy/sell
 * side and same lead currency, or both different -> as they are; one of the two different -> swapped.
 */
export function dssPartner(leg: FxDeal, fxDeals: readonly FxDeal[]): { partner: FxDeal; swapped: boolean } | null {
  const partner = leg.dssDeal ? fxDeals.find((r) => r.dealType === leg.dssDeal) : undefined
  if (!partner) return null
  const sameSide = leg.bs1 === partner.bs1
  const sameCurr = leg.curr1 === partner.curr1
  return { partner, swapped: sameSide !== sameCurr }
}

async function writeFx(leg: FxDeal, fxDeals: readonly FxDeal[], form: FxPostForm, extra: AppStrFields, deps: SettlementDeps): Promise<string[]> {
  await deps.updateFx(leg.bukrs, leg.rfha, { ...tsfFields(leg, form), ...extra })
  const written = [`${leg.dealType} ${leg.rfha}`]
  const dss = dssPartner(leg, fxDeals)
  if (dss) {
    await deps.updateFx(dss.partner.bukrs, dss.partner.rfha, { ...(dss.swapped ? tsfFieldsSwapped(leg, form) : tsfFields(leg, form)), ...extra })
    written.push(`${dss.partner.dealType} ${dss.partner.rfha}`)
  }
  return written
}

/** Update (UPD): the leg's TSF bank fields, and its DSS deal's (S036). No status check in the program. */
export async function updateFxLeg(leg: FxDeal, fxDeals: readonly FxDeal[], form: FxPostForm, deps: SettlementDeps = defaultDeps): Promise<ActionResult> {
  try {
    const written = await writeFx(leg, fxDeals, form, {}, deps)
    return { ok: true, message: `Bank details updated for ${written.join(' and ')} (S036).` }
  } catch (error) {
    return failed(`Updating transaction ${leg.rfha}`, error)
  }
}

/** Settlement Complete (SET_EXE): the sequence rule, then ZTSF_EXE_CO = 'X' with the bank fields, and the DSS deal (S069). */
export async function completeFxLeg(
  leg: FxDeal,
  fxDeals: readonly FxDeal[],
  invoices: readonly TradeInvoice[],
  form: FxPostForm,
  deps: SettlementDeps = defaultDeps,
): Promise<ActionResult> {
  if (leg.settled) return { ok: false, error: `Transaction ${leg.rfha} is already settled.` }
  if ((!leg.seq.trim() || Number(leg.seq) === 0) && !leg.setFxBuy && !leg.setFxSell) {
    return { ok: false, error: `FX deal ${leg.dealType} ${leg.rfha} has no settlement mapping. Configure SET_FX before settling.` }
  }
  const refusal = sequenceRefusal(leg.seq, invoices, fxDeals, 'fx')
  if (refusal) return { ok: false, error: refusal }
  try {
    const written = await writeFx(leg, fxDeals, form, { ZtsfExeCo: true }, deps)
    return { ok: true, message: `Settled ${written.join(' and ')} (S069). Their accounting entries are posted on BO: Post Accounting Entries for Settlement (ZSGTSFR081).` }
  } catch (error) {
    return failed(`Settling transaction ${leg.rfha}`, error)
  }
}

// ------------------------------------------------------------------ Execution Complete

/**
 * EXE_C's check: '' when the Deal ID may move to 21, else why not. A no-invoice model needs every FX leg its model
 * maps (SET_FX) settled (I065); an invoice model needs exactly six settled trade legs (I064) and, for each trade leg,
 * the FX legs of its D-map and DSS deal settled (I065).
 */
export function executionRefusal(fxDeals: readonly FxDeal[], invoices: readonly TradeInvoice[], noInvoiceFlag: boolean): string {
  const open = (types: readonly string[]) =>
    fxDeals.filter((f) => types.includes(f.dealType) && !f.settled).map((f) => `${f.dealType} ${f.rfha}`)
  if (noInvoiceFlag) {
    const legs = fxDeals.filter((f) => (f.setFxBuy || f.setFxSell) && !f.settled).map((f) => `${f.dealType} ${f.rfha}`)
    return legs.length ? `These FX legs are not settled yet: ${legs.join(', ')} (I065).` : ''
  }
  const settled = invoices.filter((r) => r.setCo).length
  if (settled !== TRADE_LEGS) {
    const openLegs = invoices.filter((r) => !r.setCo).map((r) => `${r.seq} ${r.leg}`)
    return `${settled} of ${TRADE_LEGS} trade invoice legs are settled (I064). Not settled yet: ${openLegs.join(', ') || '-'}.`
  }
  const mapped = invoices.flatMap((r) => [r.dMap ?? '', r.dssDeal ?? ''].filter(Boolean))
  const fx = [...new Set(open(mapped))]
  return fx.length ? `These FX legs are not settled yet: ${fx.join(', ')} (I065).` : ''
}

/** Execution Complete (EXE_C): 20 -> 21 once executionRefusal has nothing to say. */
export async function completeExecution(
  deal: Deal,
  fxDeals: readonly FxDeal[],
  invoices: readonly TradeInvoice[],
  deps: SettlementDeps = defaultDeps,
): Promise<ActionResult> {
  if (deal.dealStatus !== SETTLEMENT_INITIATED) return { ok: false, error: notInitiated(deal) }
  const refusal = executionRefusal(fxDeals, invoices, deal.noInvoiceFlag)
  if (refusal) return { ok: false, error: refusal }
  try {
    await deps.setDealStatus(deal, EXECUTION_COMPLETED)
    return { ok: true, message: `Deal ID ${deal.dealId} is now 21 - Settlement Completed - Execution. The accounting entries are posted next, on BO: Post Accounting Entries for Settlement (ZSGTSFR081).` }
  } catch (error) {
    return failed(`Moving Deal ID ${deal.dealId} to ${EXECUTION_COMPLETED}`, error)
  }
}
