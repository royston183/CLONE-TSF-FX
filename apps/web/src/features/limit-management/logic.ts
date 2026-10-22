import type { BankSummary, Limit, LimitDeal, MailPreview, RawLimit } from './types.ts'

/** Status texts (text symbols 013-018 of the program). */
export const STATUS_TEXT = {
  approvedInitial: 'Approved Initial Limit',
  approvedAdditional: 'Approved Additional Limit',
  rejectedInitial: 'Rejected Initial Amt',
  revised: 'Revised - Awaiting approval',
  awaiting: 'Awaiting approval',
  rejectedAdd: 'Rejected Add Amt',
} as const

export const STATUS_LIST: readonly string[] = [
  STATUS_TEXT.approvedInitial,
  STATUS_TEXT.approvedAdditional,
  STATUS_TEXT.awaiting,
  STATUS_TEXT.revised,
  STATUS_TEXT.rejectedInitial,
  STATUS_TEXT.rejectedAdd,
]

/** A pair as the screen writes it: USD-INR. Accepts USD/INR and USDINR too. */
export function normalisePair(value: string | null | undefined): string {
  const s = String(value ?? '').trim().toUpperCase()
  const m = /^([A-Z]{3})[\s/-]?([A-Z]{3})$/.exec(s)
  return m ? `${m[1]}-${m[2]}` : s
}

/** Buy / sell split and USD leg of a deal, as PROCESS_SUM1. */
export function splitDeal(d: {
  pair: string
  bs1: string
  curr1: string
  amt1: number
  curr2: string
  amt2: number
}): Pick<LimitDeal, 'buyAmt' | 'buyCurr' | 'sellAmt' | 'sellCurr' | 'usdAmt' | 'dealAmt'> {
  const buy1 = d.bs1 === 'Buy'
  const buyAmt = Math.abs(buy1 ? d.amt1 : d.amt2)
  const buyCurr = buy1 ? d.curr1 : d.curr2
  const sellAmt = Math.abs(buy1 ? d.amt2 : d.amt1)
  const sellCurr = buy1 ? d.curr2 : d.curr1
  const usdAmt = d.pair.slice(0, 3) === buyCurr ? buyAmt : sellAmt
  const dealAmt = d.curr1 === 'USD' ? d.amt1 : d.curr2 === 'USD' ? d.amt2 : 0
  return { buyAmt, buyCurr, sellAmt, sellCurr, usdAmt, dealAmt }
}

/** D1 deals of a limit's pair traded inside its validity period (inclusive). */
export function dealsForLimit(raw: Pick<RawLimit, 'pair' | 'startDt' | 'endDt'>, deals: readonly LimitDeal[]): LimitDeal[] {
  return deals.filter((d) => d.dealType === 'D1' && d.pair === raw.pair && d.tradeDate >= raw.startDt && d.tradeDate <= raw.endDt)
}

/** The table row for a limit. Utilised is ZUTL_AMT of the limit row; Balance = total approved - utilised. */
export function deriveLimit(raw: RawLimit): Limit {
  let zadd = 0
  if (raw.zad > raw.zini) zadd = raw.zad - raw.zini
  else if (raw.zini) zadd = raw.zunaprov
  const base = { ...raw, balance: raw.zad - raw.utl, total: raw.zad, zin: raw.zini ? raw.zini : raw.zunaprov, zadd }
  if (raw.app && !raw.addlim) return { ...base, statusText: STATUS_TEXT.approvedInitial, kind: 'ok', light: 'ok' }
  if (raw.app && raw.addlim) return { ...base, statusText: STATUS_TEXT.approvedAdditional, kind: 'ok', light: 'ok' }
  if (raw.rej && raw.zad) return { ...base, statusText: STATUS_TEXT.rejectedAdd, kind: 'bad', light: 'bad' }
  if (raw.rej) return { ...base, statusText: STATUS_TEXT.rejectedInitial, kind: 'bad', light: 'bad' }
  if (raw.addlim) return { ...base, statusText: STATUS_TEXT.revised, kind: 'wait', light: 'led' }
  return { ...base, statusText: STATUS_TEXT.awaiting, kind: 'wait', light: 'wait' }
}

/** Additional limit only on an approved limit (PAI of SET_ADD). */
export function canSetAdditional(row: Limit | null | undefined): boolean {
  if (!row) return false
  const blocked = row.statusText === STATUS_TEXT.revised || row.statusText === STATUS_TEXT.rejectedAdd || row.statusText === STATUS_TEXT.rejectedInitial
  return !blocked && !!row.zad
}

/** Overlap rule of SET_LIMIT (ZSGTSFTR_LIM_MAN): same year and limit currency, overlapping validity. */
export function limitOverlaps(limits: readonly RawLimit[], curr: string, year: number, startDt: string, endDt: string): boolean {
  return limits.some((r) => r.curr === curr && r.year === year && r.startDt <= endDt && r.endDt >= startDt)
}

/** CONVERT_MILLION: commas / spaces removed, a trailing M multiplies by 1,000,000. NaN when not a number. */
export function parseLimitAmount(raw: string | null | undefined): number {
  const s = String(raw ?? '').replace(/[,\s]/g, '').toUpperCase()
  const m = /^(\d+(\.\d+)?)(M)?$/.exec(s)
  return m ? parseFloat(m[1] ?? '') * (m[3] ? 1_000_000 : 1) : NaN
}

/** Bank-wise summary: grouped by business partner number (ascending), rank = row position. */
export function buildBankSummary(deals: readonly LimitDeal[]): BankSummary {
  const map = new Map<string, { bpNo: string; name: string; usd: number; txn: number }>()
  let total = 0
  for (const d of deals) {
    const row = map.get(d.bpNo) ?? { bpNo: d.bpNo, name: d.bpName, usd: 0, txn: 0 }
    row.usd += Math.abs(d.usdAmt)
    row.txn += 1
    map.set(d.bpNo, row)
    total += Math.abs(d.usdAmt)
  }
  const rows = [...map.values()]
    .sort((a, b) => a.bpNo.localeCompare(b.bpNo))
    .map((r, i) => ({ ...r, pct: total ? Math.round((r.usd / total) * 100000) / 1000 : 0, rank: i + 1 }))
  return { rows, total: { usd: total, txn: deals.length, pct: total ? 100 : 0 } }
}

export const formatAmount = (n: number): string => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatPct = (n: number): string => `${Number(n).toFixed(3)} %`
export const isoToDots = (iso: string): string => (iso ? iso.split('-').reverse().join('.') : '')

/** The approval e-mail of LCL_LIMIT_EMAIL_SENDER, as a preview (this screen does not send it). */
export function buildLimitEmail(raw: RawLimit, type: 'initial' | 'additional', initialAmt: number, additionalAmt: number): MailPreview {
  const rows: [string, string][] = [
    ['Validity Year:', String(raw.year)],
    ['Validity Start Date:', isoToDots(raw.startDt)],
    ['Validity End Date:', isoToDots(raw.endDt)],
    ['Currency Pair:', raw.pair],
    ['Initial Limit Amount(USD)', formatAmount(initialAmt)],
  ]
  if (type === 'additional') rows.push(['Additional Limit  Amount(USD)', formatAmount(additionalAmt)])
  return { subject: `${type === 'initial' ? 'Initial Limit Proposal FY : ' : 'Additional Limit Proposal FY : '}${raw.year} for TSF-FX`, rows }
}
