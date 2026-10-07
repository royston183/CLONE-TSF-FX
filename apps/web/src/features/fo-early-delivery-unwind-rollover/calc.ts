/*
 * The amount / rate arithmetic of ZSGTSFP_PRE_MATURE (FORM process_data, FORM fetch_data1, FORM amount),
 * as pure functions. No React, no network.
 */
import type { FxRow } from '../../shared/fx/mw.ts'
import { txt } from '../../shared/fx/masters.ts'

/** cs_idr / cs_kwa / cs_vnd: these currencies are quoted per 1000 units (cs_i1000). */
export const THOUSAND_CURRENCIES: readonly string[] = ['IDR', 'KWA', 'VND']
export const RATE_FACTOR = 1000

export const rateFactor = (currency: string): number => (THOUSAND_CURRENCIES.includes(currency) ? RATE_FACTOR : 1)

/** The text a user typed or the screen formatted ("1,234.50") as a number; NaN for blank or junk. */
export function parseNumber(text: string | number | null | undefined): number {
  if (typeof text === 'number') return text
  const cleaned = String(text ?? '').replace(/,/g, '').trim()
  return cleaned === '' ? NaN : Number(cleaned)
}

/** 0 for blank (an ABAP initial amount), never NaN. */
export const amountOf = (text: string | number | null | undefined): number => {
  const n = parseNumber(text)
  return Number.isFinite(n) ? n : 0
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * One conversion step of process_data. `target` is the currency whose amount is being derived from the
 * other side's amount:
 *   target is the FOLLOW currency   target = rate * f * other
 *   otherwise                       target = other / (rate * f)
 * with f = 1000 for IDR / KWA / VND (checked on the TARGET currency, as in the source). ABAP swallows the
 * arithmetic exceptions and leaves the field unchanged, which is `null` here: a rate of 0 derives nothing.
 */
export function convertAmount(rate: number, other: number, targetCurrency: string, followCurrency: string): number | null {
  if (!(rate > 0) || !Number.isFinite(other) || !Number.isFinite(rate)) return null
  const f = rateFactor(targetCurrency)
  const value = targetCurrency === followCurrency ? rate * f * other : other / (rate * f)
  return Number.isFinite(value) ? round2(value) : null
}

/** One side of a booking as process_data sees it: amt in tCurr, amt2 in tCurr2. 0 is "initial". */
export type AmountSide = { tCurr: string; tCurr2: string; amt: number; amt2: number; rate: number }

/**
 * IF amt IS INITIAL derive it from amt2, then IF amt2 IS INITIAL derive it from amt. Amounts that are
 * already filled stay as the user left them.
 */
export function fillMissingAmounts(side: AmountSide, followCurrency: string): AmountSide {
  const out = { ...side }
  if (!out.amt) out.amt = convertAmount(out.rate, out.amt2, out.tCurr, followCurrency) ?? out.amt
  if (!out.amt2) out.amt2 = convertAmount(out.rate, out.amt, out.tCurr2, followCurrency) ?? out.amt2
  return out
}

/**
 * ON CHANGE OF rate: the amount the user did not type is recomputed from the one they did. `keep` is the
 * side that stays. Nothing happens for a rate that cannot be applied.
 */
export function recomputeOnRateChange(side: AmountSide, followCurrency: string, keep: 'amt' | 'amt2'): AmountSide {
  const out = { ...side }
  if (keep === 'amt') out.amt2 = convertAmount(out.rate, out.amt, out.tCurr2, followCurrency) ?? out.amt2
  else out.amt = convertAmount(out.rate, out.amt2, out.tCurr, followCurrency) ?? out.amt
  return out
}

/** The follow (second) currency of a pair written "USD/INR" — ZSGTRMFM_LEAD_CURR's F_CURRENCY. */
export const followOfPair = (cpair: string): string => cpair.split('/')[1]?.trim() ?? ''

/* ---------------- INR amount from the invoice plan (FORM fetch_data1 / FORM amount) ---------------- */

/** One ZSGTSFTR_BIL_ADJ row of the Deal ID in INR, with the deal's ZSGTSFTR_RULE_BT invoice-link columns. */
export type InvoiceAmountRow = { d1Link: string; d2Link: string; ref: string; amount: number }

/** `zinv_ref+11(2)`: the invoice type (T1 / T2 / T3) sits at offset 11 of the reference. */
export const invoiceTypeOf = (ref: string): string => ref.slice(11, 13)

/**
 * BIL_ADJ (INR) ⋈ RULE_BT of the deal's model, as fetch_data1 selects it. Rows are the middleware's rows of the
 * two tables; `ruleRows` are the RULE_BT rows of the deal's ZTSF_MODEL.
 */
export function invoiceAmountRows(billRows: readonly FxRow[], ruleRows: readonly FxRow[]): InvoiceAmountRow[] {
  const out: InvoiceAmountRow[] = []
  for (const bill of billRows) {
    if (txt(bill, 'ZCURR') !== 'INR') continue
    for (const rule of ruleRows) {
      out.push({
        d1Link: txt(rule, 'ZD1_INV_LINK'),
        d2Link: txt(rule, 'ZD2_INV_LINK'),
        ref: txt(bill, 'ZINV_REF'),
        amount: amountOf(bill['ZAMT']),
      })
    }
  }
  return out
}

/**
 * The INR amount the New Booking is prefilled with, statement for statement from fetch_data1:
 *   one row only            its amount
 *   several rows, deal D1   T1 / T2 / T3 rows linked 01 / 02 / 03 — the amount of that row, or, when more than
 *                           one T1 reference exists, the SUM of that invoice type (FORM amount); the later of
 *                           T1 / T2 / T3 wins
 *   several rows, other     nothing (0): the source only handles D1
 * Returns 0 when there is nothing to prefill.
 */
export function inrInvoiceAmount(rows: readonly InvoiceAmountRow[], dealType: string): number {
  if (!rows.length) return 0
  if (rows.length <= 1) return rows[0]?.amount ?? 0
  if (dealType !== 'D1') return 0
  // lv_record2 counts T1 references only, and gates all three branches.
  const t1Count = rows.filter((r) => invoiceTypeOf(r.ref) === 'T1').length
  const sumOf = (type: string) => rows.filter((r) => invoiceTypeOf(r.ref) === type).reduce((sum, r) => sum + r.amount, 0)
  let amount = 0
  for (const [link, type] of [['01', 'T1'], ['02', 'T2'], ['03', 'T3']] as const) {
    const row = rows.find((r) => r.d1Link === link && invoiceTypeOf(r.ref) === type)
    if (row) amount = t1Count > 1 ? sumOf(type) : row.amount
  }
  return amount
}
