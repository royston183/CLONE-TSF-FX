/** Pure business rules of the Execute Settlement for Deal ID screen. No DOM, no state. */
import { formatAmount } from './format.ts'
import type { Deal, FxDeal, FxPostDefaults, Indexed, InvPostForm, Result, StatusMeta, TradeInvoice } from './types.ts'

export const DEAL_ID_REQUIRED = 'Please enter a Deal ID. (Deal ID is a mandatory field.)'
export const DATE_REQUIRED = 'Enter a date first.'
export const dealNotFound = (id: string): string => `Deal ID ${id} does not exist in ZSGTSFTR_DEALID.`

// ------------------------------------------------------------------ selection screen

/** P_DEAL: any non-blank value, upper-cased; the program then reads ZSGTSFTR_DEALID by it. */
export function normalizeDealId(raw: string): string | null {
  const v = raw.trim()
  return v === '' ? null : v.toUpperCase()
}

// ------------------------------------------------------------------ status

/** Pill colour by status code band (display only; the codes are ZSGTSFTR_DEAL_ST's). */
export function statusClass(code: string): string {
  const n = parseInt(code, 10)
  if (!Number.isFinite(n) || n < 5) return 'pill-early'
  if (n < 15) return 'pill-progress'
  if (n < 20) return 'pill-due'
  if (n === 20) return 'pill-init'
  return 'pill-done'
}

/** The status's ZSGTSFTR_DEAL_ST text; an unknown code keeps its code and has no text. */
export function statusMeta(code: string, statuses: readonly StatusMeta[]): StatusMeta {
  return statuses.find((s) => s.code === code) ?? { code, text: '', cls: statusClass(code) }
}

export type ToolbarVisibility = { showInit: boolean; showExeC: boolean }

/**
 * Status-driven toolbar: Initiate Settlement is offered for 05..19, Execution Complete only at
 * 20, neither at or below 04 or from 21 up.
 */
export function toolbarVisibility(statusCode: string): ToolbarVisibility {
  const stat = parseInt(statusCode, 10)
  if (stat >= 5 && stat <= 19) return { showInit: true, showExeC: false }
  if (stat === 20) return { showInit: false, showExeC: true }
  return { showInit: false, showExeC: false }
}

/** Bank Type (SET_FX ZACC) and Transfer Type (ZTRF_TYPE) texts, as screen 9003 shows them. */
export const BANK_TYPES: Record<string, string> = { '01': 'Bank Account', '02': 'Bank BP', '04': 'Bank Clearing' }
export const TRANSFER_TYPES: Record<string, string> = {
  '01': 'TT Form',
  '02': 'ECM',
  '03': 'Letter',
  '04': 'Indirect',
  '05': 'SSI Letter + ECM',
  '06': 'SSI Letter',
}

// ------------------------------------------------------------------ grids

const includesQuery = (haystack: string, q: string) => haystack.toLowerCase().includes(q.toLowerCase())

export function filterFxDeals(rows: readonly FxDeal[], query: string): Indexed<FxDeal>[] {
  return rows
    .map((row, idx) => ({ row, idx }))
    .filter(
      ({ row: r }) =>
        !query ||
        includesQuery(`${r.rfha} ${r.bp} ${r.dealType} ${r.entity} ${r.curr1} ${r.curr2} ${r.mcRefNo} ${r.status}`, query),
    )
}

export function filterInvoices(rows: readonly TradeInvoice[], query: string): Indexed<TradeInvoice>[] {
  return rows
    .map((row, idx) => ({ row, idx }))
    .filter(
      ({ row: r }) =>
        !query || includesQuery(`${r.leg} ${r.trfDesc} ${r.xblnr} ${r.curr} ${r.recPay} ${r.trfType}`, query),
    )
}

/** Clicking the selected row again clears the selection. */
export const toggleRowSelection = (current: number | null, idx: number): number | null => (current === idx ? null : idx)

// ------------------------------------------------------------------ Amend Deal End Date / Edit DMS

export const amendDateInitial = (deal: Deal): string => deal.revisedEndDate || deal.dealEndDate

/** The popups' only validation: a date is required. */
export function validateDate(raw: string): Result<string> {
  const v = raw.trim()
  return v ? { ok: true, value: v } : { ok: false, error: DATE_REQUIRED }
}

// ------------------------------------------------------------------ FX-Invoice Difference / P&L

/** Diff 1 Amt: (all-in rate - spot) x amount 1 / 100, two decimals. */
export const diff1Amount = (r: FxDeal): string => (((parseFloat(r.rate) - parseFloat(r.spot)) * r.amt1) / 100).toFixed(2)

/**
 * Realised profit shown on the D2 leg only: (D2 all-in rate - D1 all-in rate) x D1 amount 1,
 * as the original computed it from the first two FX rows. Other legs have none.
 */
export function plAmount(fxDeals: readonly FxDeal[], r: FxDeal): number | null {
  if (r.dealType !== 'D2') return null
  const d1 = fxDeals[0]
  const d2 = fxDeals[1]
  if (!d1 || !d2) return 0
  return (parseFloat(d2.rate) - parseFloat(d1.rate)) * d1.amt1
}

// ------------------------------------------------------------------ FX transaction settlement (9003)

export const dealTypeLabel = (r: FxDeal): string =>
  `${r.dealType} - ${r.dealType === 'D1' ? 'Buy/Sell leg 1' : 'Buy/Sell leg 2'}`

/**
 * Screen 9003's fields, as the double-click on an FX row fills them (TOP handle_double_click): the buy amount is
 * the leg's amount in the SET_FX buy row's currency, the sell amount likewise; the TSF bank fields are the
 * transaction's (VTBFHA ZTSF_*, through TrmFxApp) and, where blank, the SET_FX defaults (ZRBUKRS, ZPAY_ID, ZBANK_ID).
 */
export function fxPostDefaults(r: FxDeal): FxPostDefaults {
  const buy = r.setFxBuy
  const sell = r.setFxSell
  const amountIn = (curr: string | undefined) =>
    curr === r.curr1 ? `${formatAmount(r.amt1)} ${r.curr1}` : `${formatAmount(r.amt2)} ${r.curr2}`
  const t = r.tsf
  return {
    seq: r.seq,
    bSetDesc: buy?.desc ?? '',
    sSetDesc: sell?.desc ?? '',
    sLetterCode: [sell?.letCode, sell?.letName].filter(Boolean).join(' - '),
    bukrs: r.bukrs,
    rfha: r.rfha,
    dealType: dealTypeLabel(r),
    partner: r.bp,
    bAmt: amountIn(buy?.curr ?? r.curr2),
    sAmt: amountIn(sell?.curr ?? r.curr1),
    // The FI documents are BO's (BKPF, read by ZSGTSFR081); MO only shows them.
    bDoc: r.doc2 || '',
    sDoc: r.doc1 || '',
    bBankType: BANK_TYPES[buy?.acc ?? ''] ?? '',
    bTrfType: TRANSFER_TYPES[buy?.trfType ?? ''] ?? '',
    bRecCoCode: t?.rbukrs || buy?.rbukrs || '',
    bBankId: t?.bpayid || buy?.payId || '',
    bPaymentId: t?.rpayid || buy?.bankId || '',
    bHouseBank: t?.bhbkid ?? '',
    bAccountId: t?.bhktid ?? '',
    letterCode: buy?.letCode ?? '',
    letterName: buy?.letName ?? '',
    sBankType: BANK_TYPES[sell?.acc ?? ''] ?? '',
    sTrfType: TRANSFER_TYPES[sell?.trfType ?? ''] ?? '',
    sBankId: t?.spayid || sell?.payId || '',
    sPayCoCode: t?.pbukrs || sell?.rbukrs || '',
    sPaymentId: t?.ppayid || sell?.bankId || '',
    sHouseBank: t?.shbkid ?? '',
    sAccountId: t?.shktid ?? '',
  }
}

// ------------------------------------------------------------------ invoice settlement (9002)

/**
 * The Sender / Receiver Details as the SAP pop-up shows them: the buyer (SET_TYP ZBUY) pays and the seller (ZSELL)
 * receives, on a Receipt leg as on a Payment one. The house banks / accounts are the leg's stored ZSGTSFTR_TRD_POS
 * values (ZHBKID / ZHKTID, ZREC_HBKID / ZREC_HKTID); the receiver's falls back to the house bank assigned to the
 * invoice in Generate Invoices (api.ts). The FI document is BO's posting, shown read-only.
 *
 * SAP proposes the rest from VTBSTC1 (pay ID TRDINV). Until that mapping is exposed, users select a company-scoped
 * HouseBankAccount from OData. Update / Settlement Complete store the selected banks and accounts.
 */
export function invPostDefaults(r: TradeInvoice, dealId: string): InvPostForm {
  return {
    bukrs: r.bukrs ?? '',
    seq: r.seq ?? '',
    recPay: r.recPay,
    tradeType: r.leg,
    setDesc: r.trfDesc,
    payAmt: `${formatAmount(r.payAmt)} ${r.setCurr || r.curr}`,
    linkedFx: r.dMap ?? '',
    settled: r.setCo,
    trfType: TRANSFER_TYPES[r.trfType] ?? r.trfType,
    postingType: [r.fiType, r.postDesc].filter(Boolean).join(' '),
    fiPosting: !!r.postRequired,
    partnerId: r.businessPartner ?? '',
    date: r.dueDate,
    sender: r.buy ?? '',
    senderHouseBank: r.senderHouseBank ?? '',
    senderAccountId: r.senderAccountId ?? '',
    receiver: r.sell ?? '',
    receiverHouseBank: r.receiverHouseBank ?? '',
    receiverAccountId: r.receiverAccountId ?? '',
    amt: `${formatAmount(r.invAmt)} ${r.curr}`,
    fiDoc: r.fiDoc || '',
    docMsg: `${r.trfDesc} - ${r.leg} settlement for Deal ID ${dealId}`,
  }
}

/**
 * modify_screen_9002 on a Payment leg: the Sender's house bank / account is mandatory when the leg's own posting
 * type is 02 (Post to Bank Account, P1); the Receiver's when the paired Receipt leg (T2-P -> T2-S) is 01
 * (Post to Bank Account, S1). Types 03 / 04 / 05 post to clearing or a business partner and need no bank.
 * Receipt legs are display only, so nothing is required there.
 */
export function invBankRequired(r: TradeInvoice | undefined, rows: readonly TradeInvoice[]): { sender: boolean; receiver: boolean } {
  if (!r || r.recPay !== 'Payment' || r.fiDoc) return { sender: false, receiver: false }
  const receipt = rows.find((x) => x.leg === `${r.leg.slice(0, 2)}-S`)
  return { sender: r.fiType === '02', receiver: receipt?.fiType === '01' }
}
